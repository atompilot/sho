package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/atompilot/sho-api/internal/service"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/atompilot/sho-api/internal/webhook"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

var maxContentBytes = 5 << 20 // 5 MB default, overridable via MAX_CONTENT_BYTES env

func init() {
	if v := os.Getenv("MAX_CONTENT_BYTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxContentBytes = n
		}
	}
}

const maxRequestBodyBytes = 10 << 20 // 10 MB

type PostHandler struct {
	svc            *service.PostService
	llmClient      service.LLMChatter
	webhookDisp    *webhook.Dispatcher
	webhookStore   *store.WebhookStore
	masterPassword string
}

func NewPostHandler(svc *service.PostService, llmClient service.LLMChatter, wd *webhook.Dispatcher, ws *store.WebhookStore, masterPassword string) *PostHandler {
	return &PostHandler{svc: svc, llmClient: llmClient, webhookDisp: wd, webhookStore: ws, masterPassword: masterPassword}
}

// truncateProtectedContent replaces full content with a 200-rune preview
// for posts that have a non-open view_policy, matching the Get handler behaviour.
func truncateProtectedContent(posts []*model.Post) {
	for _, p := range posts {
		if p.ViewPolicy != model.ViewPolicyOpen {
			runes := []rune(p.Content)
			if len(runes) > 200 {
				runes = runes[:200]
			}
			p.Content = string(runes)
		}
	}
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
		ViewQAPrompt   *string          `json:"view_qa_prompt"`
		ViewQAAnswer   *string          `json:"view_qa_answer"`
		Unlisted       *bool            `json:"unlisted"`
		Author         *string          `json:"author"`
		AgentID        *string          `json:"agent_id"`
		AgentName      *string          `json:"agent_name"`
		WebhookURL     *string          `json:"webhook_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}
	if req.Author == nil || strings.TrimSpace(*req.Author) == "" {
		writeError(w, http.StatusBadRequest, "author is required")
		return
	}
	if len(req.Content) > maxContentBytes {
		writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("content exceeds %d MB limit", maxContentBytes>>20))
		return
	}
	if req.Format == "" || req.Format == model.FormatAuto {
		req.Format = service.DetectFormat(req.Content)
	} else if !model.ValidFormat(req.Format) {
		writeError(w, http.StatusBadRequest, "invalid format: must be one of auto, markdown, html, txt, jsx")
		return
	}
	if req.Policy == "" {
		req.Policy = model.PolicyPassword
	} else if !model.ValidPolicy(req.Policy) {
		writeError(w, http.StatusBadRequest, "invalid policy: must be one of open, password, owner-only, ai-review")
		return
	}
	if req.ViewPolicy == "" {
		req.ViewPolicy = model.ViewPolicyOpen
	} else if !model.ValidViewPolicy(req.ViewPolicy) {
		writeError(w, http.StatusBadRequest, "invalid view_policy: must be one of open, password, human-qa, ai-qa")
		return
	}

	input := service.CreatePostInput{
		Title:          req.Title,
		Content:        req.Content,
		Format:         req.Format,
		Policy:         req.Policy,
		Password:       req.Password,
		AIReviewPrompt: req.AIReviewPrompt,
		ViewPolicy:     req.ViewPolicy,
		ViewPassword:   req.ViewPassword,
		ViewQAQuestion: req.ViewQAQuestion,
		ViewQAPrompt:   req.ViewQAPrompt,
		ViewQAAnswer:   req.ViewQAAnswer,
		Author:         req.Author,
		AgentID:        req.AgentID,
		AgentName:      req.AgentName,
		WebhookURL:     req.WebhookURL,
	}
	if req.Unlisted != nil && *req.Unlisted {
		input.Unlisted = true
	}

	resp, err := h.svc.CreatePost(r.Context(), input)
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

	// Register webhook if provided
	if req.WebhookURL != nil && *req.WebhookURL != "" && h.webhookStore != nil {
		wh := &store.Webhook{
			ID:          uuid.New(),
			PostSlug:    resp.Slug,
			EndpointURL: *req.WebhookURL,
			Events:      []string{"post.updated", "post.liked", "comment.created"},
			IsActive:    true,
		}
		if err := h.webhookStore.Create(r.Context(), wh); err != nil {
			log.Printf("register webhook for %s: %v", resp.Slug, err)
		}
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
		if post.Author != nil {
			resp["author"] = *post.Author
		}
		if post.AgentID != nil {
			resp["agent_id"] = *post.AgentID
		}
		if post.AgentName != nil {
			resp["agent_name"] = *post.AgentName
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
		Content    string  `json:"content"`
		Title      *string `json:"title"`
		Credential string  `json:"credential"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Content) > maxContentBytes {
		writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("content exceeds %d MB limit", maxContentBytes>>20))
		return
	}

	err := h.svc.UpdatePost(r.Context(), service.UpdatePostInput{
		Slug:       slug,
		Content:    req.Content,
		Title:      req.Title,
		Credential: req.Credential,
		EditedBy:   req.Credential,
	}, h.llmClient)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if errors.Is(err, policy.ErrInvalidCredential) {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	var aiRejected service.ErrAIReviewRejected
	if errors.As(err, &aiRejected) {
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error":  "ai_review_rejected",
			"reason": aiRejected.Reason,
		})
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

	// Support both legacy ?token= query param and credential in body (same as update).
	credential := r.URL.Query().Get("token")
	if credential == "" {
		var body struct {
			Credential string `json:"credential"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			credential = body.Credential
		}
	}

	err := h.svc.DeletePost(r.Context(), slug, credential)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if errors.Is(err, policy.ErrInvalidCredential) {
		writeError(w, http.StatusUnauthorized, "invalid credential")
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
	truncateProtectedContent(posts)
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
	truncateProtectedContent(posts)
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
	truncateProtectedContent(posts)
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

func (h *PostHandler) ReportRenderError(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	fp := likeFingerprint(r)
	err := h.svc.ReportRenderError(r.Context(), slug, fp)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if err != nil {
		log.Printf("report render error %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to report render error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reported"})
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

	if !alreadyLiked && h.webhookDisp != nil {
		h.webhookDisp.Emit(webhook.Event{
			Type: "post.liked",
			Slug: slug,
			Data: map[string]any{"likes": newLikes},
		})
	}
}

func (h *PostHandler) Share(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	newShares, alreadyShared, err := h.svc.SharePost(r.Context(), slug, likeFingerprint(r))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	if err != nil {
		log.Printf("share post %s: %v", slug, err)
		writeError(w, http.StatusInternalServerError, "failed to share post")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"shares": newShares, "already_shared": alreadyShared})
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

	if h.webhookDisp != nil {
		h.webhookDisp.Emit(webhook.Event{
			Type: "comment.created",
			Slug: slug,
			Data: comment,
		})
	}
}

func (h *PostHandler) ListByAgent(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "agent_id")
	if agentID == "" {
		writeError(w, http.StatusBadRequest, "agent_id is required")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	posts, err := h.svc.ListByAgent(r.Context(), agentID, limit, offset)
	if err != nil {
		log.Printf("list by agent %s: %v", agentID, err)
		writeError(w, http.StatusInternalServerError, "failed to list posts by agent")
		return
	}
	if posts == nil {
		posts = []*model.Post{}
	}
	truncateProtectedContent(posts)
	writeJSON(w, http.StatusOK, posts)
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

func (h *PostHandler) RandomAuthor(w http.ResponseWriter, r *http.Request) {
	name, err := h.svc.GenerateRandomAuthor(r.Context())
	if err != nil {
		log.Printf("generate random author: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to generate author")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"author": name})
}

func (h *PostHandler) VerifyMasterPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	valid := policy.CheckMasterPassword(h.masterPassword, req.Password)
	writeJSON(w, http.StatusOK, map[string]bool{"valid": valid})
}
