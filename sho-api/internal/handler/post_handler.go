package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/atompilot/sho-api/internal/service"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const maxRequestBodyBytes = 10 << 20 // 10 MB
const maxContentBytes = 1 << 20      // 1 MB

type PostHandler struct {
	svc       *service.PostService
	llmClient service.LLMChatter
}

func NewPostHandler(svc *service.PostService, llmClient service.LLMChatter) *PostHandler {
	return &PostHandler{svc: svc, llmClient: llmClient}
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
		Title          *string          `json:"title"`
		Content        string           `json:"content"`
		Format         model.Format     `json:"format"`
		Policy         model.Policy     `json:"policy"`
		Password       *string          `json:"password"`
		AIReviewPrompt *string          `json:"ai_review_prompt"`
		ViewPolicy     model.ViewPolicy `json:"view_policy"`
		ViewPassword   *string          `json:"view_password"`
		ViewQAQuestion *string          `json:"view_qa_question"`
		ViewQAAnswer   *string          `json:"view_qa_answer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}
	if len(req.Content) > maxContentBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "content exceeds 1 MB limit")
		return
	}
	if req.Format == "" || req.Format == model.FormatAuto {
		req.Format = service.DetectFormat(req.Content)
	} else if !model.ValidFormat(req.Format) {
		writeError(w, http.StatusBadRequest, "invalid format: must be one of auto, markdown, html, txt, jsx")
		return
	}
	if req.Policy == "" {
		req.Policy = model.PolicyLocked
	} else if !model.ValidPolicy(req.Policy) {
		writeError(w, http.StatusBadRequest, "invalid policy: must be one of open, locked, password, owner-only, ai-review")
		return
	}
	if req.ViewPolicy == "" {
		req.ViewPolicy = model.ViewPolicyOpen
	} else if !model.ValidViewPolicy(req.ViewPolicy) {
		writeError(w, http.StatusBadRequest, "invalid view_policy: must be one of open, password, human-qa, ai-qa")
		return
	}

	resp, err := h.svc.CreatePost(r.Context(), service.CreatePostInput{
		Title:          req.Title,
		Content:        req.Content,
		Format:         req.Format,
		Policy:         req.Policy,
		Password:       req.Password,
		AIReviewPrompt: req.AIReviewPrompt,
		ViewPolicy:     req.ViewPolicy,
		ViewPassword:   req.ViewPassword,
		ViewQAQuestion: req.ViewQAQuestion,
		ViewQAAnswer:   req.ViewQAAnswer,
	})
	if err != nil {
		var dupErr service.ErrDuplicateContent
		if errors.As(err, &dupErr) {
			writeJSON(w, http.StatusConflict, map[string]string{
				"error": "duplicate_content",
				"slug":  dupErr.Slug,
			})
			return
		}
		if errors.Is(err, service.ErrEmptyContent) {
			writeError(w, http.StatusBadRequest, "content is required")
			return
		}
		// Surface validation errors as 400
		msg := err.Error()
		if strings.Contains(msg, "is required for") || strings.Contains(msg, "view policy") {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
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

	if post.ViewPolicy != model.ViewPolicyOpen {
		// Build a restricted view with preview instead of full content
		runes := []rune(post.Content)
		if len(runes) > 200 {
			runes = runes[:200]
		}
		preview := string(runes)
		resp := map[string]any{
			"id":          post.ID,
			"slug":        post.Slug,
			"format":      post.Format,
			"policy":      post.Policy,
			"views":       post.Views,
			"likes":       post.Likes,
			"created_at":  post.CreatedAt,
			"updated_at":  post.UpdatedAt,
			"view_policy": post.ViewPolicy,
			"preview":     preview,
		}
		if post.Title != nil {
			resp["title"] = *post.Title
		}
		if post.AITitle != nil {
			resp["ai_title"] = *post.AITitle
		}
		if post.ViewQAQuestion != nil {
			resp["view_qa_question"] = *post.ViewQAQuestion
		}
		writeJSON(w, http.StatusOK, resp)
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

	if len(req.Content) > maxContentBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "content exceeds 1 MB limit")
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
	format := r.URL.Query().Get("format")

	posts, err := h.svc.ListPosts(r.Context(), limit, offset, format)
	if err != nil {
		log.Printf("list posts: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list posts")
		return
	}
	if posts == nil {
		posts = []*model.Post{}
	}
	writeJSON(w, http.StatusOK, posts)
}

func (h *PostHandler) ListRecommended(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	format := r.URL.Query().Get("format")

	posts, err := h.svc.ListRecommended(r.Context(), limit, offset, format)
	if err != nil {
		log.Printf("list recommended posts: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list recommended posts")
		return
	}
	if posts == nil {
		posts = []*model.Post{}
	}
	writeJSON(w, http.StatusOK, posts)
}

func (h *PostHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	format := r.URL.Query().Get("format")

	posts, err := h.svc.SearchPosts(r.Context(), q, limit, offset, format)
	if err != nil {
		log.Printf("search posts: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to search posts")
		return
	}
	if posts == nil {
		posts = []*model.Post{}
	}
	writeJSON(w, http.StatusOK, posts)
}

func clientIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func likeFingerprint(r *http.Request) string {
	raw := clientIP(r) + "|" + r.Header.Get("User-Agent")
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (h *PostHandler) RecordView(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	fp := likeFingerprint(r) // reuse same IP+UA fingerprint strategy
	views, counted, err := h.svc.RecordView(r.Context(), slug, fp)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if err != nil {
		log.Printf("record view %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to record view")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"views": views, "counted": counted})
}

func (h *PostHandler) Like(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	newLikes, alreadyLiked, err := h.svc.LikePost(r.Context(), slug, likeFingerprint(r))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if err != nil {
		log.Printf("like post %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to like post")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"likes": newLikes, "already_liked": alreadyLiked})
}

func (h *PostHandler) ListVersions(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	versions, total, err := h.svc.ListVersions(r.Context(), slug, limit)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if err != nil {
		log.Printf("list versions %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to list versions")
		return
	}
	if versions == nil {
		versions = []*model.PostVersion{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": versions, "total": total})
}

func (h *PostHandler) ListComments(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	comments, err := h.svc.ListComments(r.Context(), slug)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if err != nil {
		log.Printf("list comments %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to list comments")
		return
	}
	if comments == nil {
		comments = []*model.Comment{}
	}
	writeJSON(w, http.StatusOK, comments)
}

func (h *PostHandler) CreateComment(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	slug := chi.URLParam(r, "slug")

	var req struct {
		Content  string  `json:"content"`
		ParentID *string `json:"parent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var parentID *uuid.UUID
	if req.ParentID != nil && *req.ParentID != "" {
		parsed, err := uuid.Parse(*req.ParentID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid parent_id")
			return
		}
		parentID = &parsed
	}

	comment, err := h.svc.AddComment(r.Context(), slug, req.Content, parentID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if errors.Is(err, service.ErrEmptyComment) || errors.Is(err, service.ErrParentNotBelongToPost) || errors.Is(err, service.ErrParentCommentNotFound) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		log.Printf("create comment %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to create comment")
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

func (h *PostHandler) VerifyView(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	slug := chi.URLParam(r, "slug")

	var req struct {
		Credential string `json:"credential"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	result, err := h.svc.VerifyView(r.Context(), slug, req.Credential, h.llmClient)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if err != nil {
		log.Printf("verify view %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to verify view")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
