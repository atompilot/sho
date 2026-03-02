package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/atompilot/sho-api/internal/store"
)

type Event struct {
	Type string `json:"type"` // post.updated, post.liked, comment.created
	Slug string `json:"slug"`
	Data any    `json:"data"`
}

type Dispatcher struct {
	webhookStore *store.WebhookStore
	queue        chan Event
	client       *http.Client
}

func NewDispatcher(ws *store.WebhookStore) *Dispatcher {
	return &Dispatcher{
		webhookStore: ws,
		queue:        make(chan Event, 256),
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (d *Dispatcher) Emit(evt Event) {
	select {
	case d.queue <- evt:
	default:
		log.Printf("webhook queue full, dropping event: %s for %s", evt.Type, evt.Slug)
	}
}

func (d *Dispatcher) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case evt := <-d.queue:
			d.dispatch(ctx, evt)
		}
	}
}

func (d *Dispatcher) dispatch(ctx context.Context, evt Event) {
	webhooks, err := d.webhookStore.ListBySlug(ctx, evt.Slug)
	if err != nil {
		log.Printf("webhook dispatch: list webhooks for %s: %v", evt.Slug, err)
		return
	}

	for _, wh := range webhooks {
		if !matchesEvent(wh.Events, evt.Type) {
			continue
		}
		go d.send(wh, evt)
	}
}

func matchesEvent(events []string, evtType string) bool {
	if len(events) == 0 {
		return true // empty = all events
	}
	for _, e := range events {
		if e == evtType {
			return true
		}
	}
	return false
}

func (d *Dispatcher) send(wh *store.Webhook, evt Event) {
	payload, err := json.Marshal(evt)
	if err != nil {
		log.Printf("webhook marshal: %v", err)
		return
	}

	for attempt := range 3 {
		req, err := http.NewRequest("POST", wh.EndpointURL, bytes.NewReader(payload))
		if err != nil {
			log.Printf("webhook request build: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Sho-Event", evt.Type)

		if wh.Secret != nil && *wh.Secret != "" {
			sig := signPayload(payload, *wh.Secret)
			req.Header.Set("X-Sho-Signature", sig)
		}

		resp, err := d.client.Do(req)
		if err != nil {
			log.Printf("webhook send attempt %d to %s: %v", attempt+1, wh.EndpointURL, err)
			time.Sleep(time.Duration(attempt+1) * 2 * time.Second)
			continue
		}
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return
		}
		log.Printf("webhook send attempt %d to %s: status %d", attempt+1, wh.EndpointURL, resp.StatusCode)
		time.Sleep(time.Duration(attempt+1) * 2 * time.Second)
	}
	log.Printf("webhook delivery failed after 3 attempts to %s for event %s on %s", wh.EndpointURL, evt.Type, evt.Slug)
}

func signPayload(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return fmt.Sprintf("sha256=%s", hex.EncodeToString(mac.Sum(nil)))
}
