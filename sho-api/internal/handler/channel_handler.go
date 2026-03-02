package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type ChannelHandler struct {
	channelStore *store.ChannelStore
}

func NewChannelHandler(cs *store.ChannelStore) *ChannelHandler {
	return &ChannelHandler{channelStore: cs}
}

func (h *ChannelHandler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	var req struct {
		Name        string  `json:"name"`
		DisplayName *string `json:"display_name"`
		Description *string `json:"description"`
		AgentID     *string `json:"agent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	editToken, err := policy.GenerateToken(32)
	if err != nil {
		log.Printf("generate channel token: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create channel")
		return
	}

	ch := &model.Channel{
		ID:          uuid.New(),
		Name:        req.Name,
		DisplayName: req.DisplayName,
		Description: req.Description,
		AgentID:     req.AgentID,
		EditToken:   editToken,
	}

	if err := h.channelStore.Create(r.Context(), ch); err != nil {
		if err.Error() == "channel name already taken" {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		log.Printf("create channel: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create channel")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":         ch.ID,
		"name":       ch.Name,
		"edit_token": ch.EditToken,
		"created_at": ch.CreatedAt,
	})
}

func (h *ChannelHandler) Get(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	ch, err := h.channelStore.GetByName(r.Context(), name)
	if errors.Is(err, store.ErrChannelNotFound) {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}
	if err != nil {
		log.Printf("get channel %s: %v", name, err)
		writeError(w, http.StatusInternalServerError, "failed to get channel")
		return
	}
	writeJSON(w, http.StatusOK, ch)
}

func (h *ChannelHandler) ListPosts(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	posts, err := h.channelStore.ListPosts(r.Context(), name, limit, offset)
	if err != nil {
		log.Printf("list channel posts %s: %v", name, err)
		writeError(w, http.StatusInternalServerError, "failed to list channel posts")
		return
	}
	if posts == nil {
		posts = []*model.Post{}
	}
	writeJSON(w, http.StatusOK, posts)
}

func (h *ChannelHandler) Feed(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	ch, err := h.channelStore.GetByName(r.Context(), name)
	if errors.Is(err, store.ErrChannelNotFound) {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}
	if err != nil {
		log.Printf("get channel for feed %s: %v", name, err)
		writeError(w, http.StatusInternalServerError, "failed to get channel")
		return
	}

	posts, err := h.channelStore.ListPosts(r.Context(), name, 50, 0)
	if err != nil {
		log.Printf("list channel posts for feed %s: %v", name, err)
		writeError(w, http.StatusInternalServerError, "failed to list posts")
		return
	}

	displayName := ch.Name
	if ch.DisplayName != nil {
		displayName = *ch.DisplayName
	}
	description := ""
	if ch.Description != nil {
		description = *ch.Description
	}

	type feedItem struct {
		ID          string `json:"id"`
		URL         string `json:"url"`
		Title       string `json:"title"`
		ContentText string `json:"content_text"`
		DatePub     string `json:"date_published"`
	}

	items := make([]feedItem, 0, len(posts))
	for _, p := range posts {
		title := p.Slug
		if p.Title != nil {
			title = *p.Title
		} else if p.AITitle != nil {
			title = *p.AITitle
		}
		preview := p.Content
		if len([]rune(preview)) > 500 {
			preview = string([]rune(preview)[:500])
		}
		items = append(items, feedItem{
			ID:          p.Slug,
			URL:         "/" + p.Slug,
			Title:       title,
			ContentText: preview,
			DatePub:     p.CreatedAt.Format("2006-01-02T15:04:05Z"),
		})
	}

	feed := map[string]any{
		"version":     "https://jsonfeed.org/version/1.1",
		"title":       displayName,
		"description": description,
		"items":       items,
	}

	writeJSON(w, http.StatusOK, feed)
}
