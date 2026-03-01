package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/atompilot/sho-api/internal/llm"
)

type ChatHandler struct {
	llm *llm.Client
}

func NewChatHandler(llmClient *llm.Client) *ChatHandler {
	return &ChatHandler{llm: llmClient}
}

func (h *ChatHandler) Chat(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	var req struct {
		Messages []llm.Message `json:"messages"`
		Stream   *bool         `json:"stream"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Reject trailing data after the JSON object
	if err := dec.Decode(&json.RawMessage{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "unexpected data after JSON body")
		return
	}

	if len(req.Messages) == 0 {
		writeError(w, http.StatusBadRequest, "messages is required")
		return
	}
	// Validate each message's role and content
	for i, m := range req.Messages {
		if strings.TrimSpace(m.Content) == "" {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("messages[%d].content must not be empty", i))
			return
		}
	}
	if err := llm.ValidateMessages(req.Messages); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	stream := req.Stream == nil || *req.Stream // default true

	if !stream {
		content, err := h.llm.Chat(r.Context(), req.Messages)
		if errors.Is(err, llm.ErrNoChoices) {
			writeError(w, http.StatusBadGateway, "llm returned empty response")
			return
		}
		if err != nil {
			log.Printf("llm chat: %v", err)
			writeError(w, http.StatusBadGateway, "llm request failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"content": content})
		return
	}

	// SSE streaming
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	s, err := h.llm.ChatStream(r.Context(), req.Messages)
	if err != nil {
		log.Printf("llm stream: %v", err)
		writeError(w, http.StatusBadGateway, "llm request failed")
		return
	}
	defer s.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	for s.Next() {
		content := s.Current()
		if content == "" {
			continue
		}
		data, _ := json.Marshal(map[string]string{"content": content})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}
	if err := s.Err(); err != nil {
		log.Printf("llm stream error: %v", err)
		errData, _ := json.Marshal(map[string]string{"error": "stream interrupted"})
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", errData)
		flusher.Flush()
		return
	}
	fmt.Fprint(w, "data: [DONE]\n\n")
	flusher.Flush()
}
