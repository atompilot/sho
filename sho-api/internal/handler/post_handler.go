package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/atompilot/sho-api/internal/service"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/go-chi/chi/v5"
)

type PostHandler struct {
	svc *service.PostService
}

func NewPostHandler(svc *service.PostService) *PostHandler {
	return &PostHandler{svc: svc}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *PostHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title          *string      `json:"title"`
		Content        string       `json:"content"`
		Format         model.Format `json:"format"`
		Policy         model.Policy `json:"policy"`
		Password       *string      `json:"password"`
		AIReviewPrompt *string      `json:"ai_review_prompt"`
		Slug           *string      `json:"slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}
	if req.Format == "" {
		req.Format = model.FormatMarkdown
	}
	if req.Policy == "" {
		req.Policy = model.PolicyLocked
	}

	resp, err := h.svc.CreatePost(r.Context(), service.CreatePostInput{
		Title:          req.Title,
		Content:        req.Content,
		Format:         req.Format,
		Policy:         req.Policy,
		Password:       req.Password,
		AIReviewPrompt: req.AIReviewPrompt,
		Slug:           req.Slug,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *PostHandler) Get(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	post, err := h.svc.GetPost(r.Context(), slug)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, post)
}

func (h *PostHandler) Update(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req struct {
		Content    string `json:"content"`
		Credential string `json:"credential"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.svc.UpdatePost(r.Context(), service.UpdatePostInput{
		Slug:       slug,
		Content:    req.Content,
		Credential: req.Credential,
		EditedBy:   req.Credential,
	})
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if errors.Is(err, policy.ErrLocked) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, policy.ErrInvalidCredential) {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *PostHandler) Delete(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	editToken := r.URL.Query().Get("token")
	if editToken == "" {
		writeError(w, http.StatusUnauthorized, "edit_token required")
		return
	}

	err := h.svc.DeletePost(r.Context(), slug, editToken)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if errors.Is(err, policy.ErrInvalidCredential) {
		writeError(w, http.StatusUnauthorized, "invalid edit token")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *PostHandler) List(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	posts, err := h.svc.ListPosts(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, posts)
}
