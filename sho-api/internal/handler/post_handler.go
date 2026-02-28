package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/atompilot/sho-api/internal/service"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/go-chi/chi/v5"
)

const maxRequestBodyBytes = 10 << 20 // 10 MB

type PostHandler struct {
	svc *service.PostService
}

func NewPostHandler(svc *service.PostService) *PostHandler {
	return &PostHandler{svc: svc}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *PostHandler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

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
	} else if !model.ValidFormat(req.Format) {
		writeError(w, http.StatusBadRequest, "invalid format: must be one of markdown, html, txt, jsx")
		return
	}
	if req.Policy == "" {
		req.Policy = model.PolicyLocked
	} else if !model.ValidPolicy(req.Policy) {
		writeError(w, http.StatusBadRequest, "invalid policy: must be one of open, locked, password, owner-only, ai-review")
		return
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
		log.Printf("create post: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create post")
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
		log.Printf("get post %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to get post")
		return
	}
	writeJSON(w, http.StatusOK, post)
}

func (h *PostHandler) Update(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

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
		log.Printf("update post %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to update post")
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
		log.Printf("delete post %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to delete post")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *PostHandler) List(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	posts, err := h.svc.ListPosts(r.Context(), limit, offset)
	if err != nil {
		log.Printf("list posts: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list posts")
		return
	}
	writeJSON(w, http.StatusOK, posts)
}
