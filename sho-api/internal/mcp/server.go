package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/service"
	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// NewMCPServer creates an MCPServer with all Sho tools registered.
func NewMCPServer(postSvc *service.PostService) *mcpserver.MCPServer {
	s := mcpserver.NewMCPServer("sho", "1.0.0")

	s.AddTool(publishTool(), publishHandler(postSvc))
	s.AddTool(getTool(), getHandler(postSvc))
	s.AddTool(updateTool(), updateHandler(postSvc))
	s.AddTool(deleteTool(), deleteHandler(postSvc))
	s.AddTool(listTool(), listHandler(postSvc))
	s.AddTool(likeTool(), likeHandler(postSvc))
	s.AddTool(commentTool(), commentHandler(postSvc))
	s.AddTool(listCommentsTool(), listCommentsHandler(postSvc))

	return s
}

// SSEServer creates an SSEServer configured to serve at "/mcp" on the given
// baseURL (e.g. "http://localhost:8080"). Callers can register the individual
// handlers via SSEHandler() and MessageHandler().
func SSEServer(s *mcpserver.MCPServer, baseURL string) *mcpserver.SSEServer {
	return mcpserver.NewSSEServer(s,
		mcpserver.WithBaseURL(baseURL),
		mcpserver.WithStaticBasePath("/mcp"),
	)
}

// ---- tool definitions -------------------------------------------------------

func publishTool() mcp.Tool {
	return mcp.NewTool("sho_publish",
		mcp.WithDescription("Publish new content to Sho. Returns slug, edit_token, and manage_url."),
		mcp.WithString("content",
			mcp.Required(),
			mcp.Description("The main body of the post (markdown, HTML, or plain text)."),
		),
		mcp.WithString("format",
			mcp.Description("Content format: auto, markdown, html, txt, jsx (default: auto)."),
		),
		mcp.WithString("title",
			mcp.Description("Optional title for the post."),
		),
		mcp.WithString("policy",
			mcp.Description("Access policy: open, locked, password, owner-only, ai-review (default: open)."),
		),
		mcp.WithString("password",
			mcp.Description("Password (required when policy=password)."),
		),
		mcp.WithString("view_policy",
			mcp.Description("View policy: open, password, human-qa, ai-qa (default: open)."),
		),
		mcp.WithString("view_password",
			mcp.Description("View password (for view_policy=password). Auto-generated if empty."),
		),
		mcp.WithString("view_qa_question",
			mcp.Description("Question for human-qa or ai-qa view policy."),
		),
		mcp.WithString("view_qa_answer",
			mcp.Description("Answer for human-qa view policy (exact match)."),
		),
	)
}

func getTool() mcp.Tool {
	return mcp.NewTool("sho_get",
		mcp.WithDescription("Retrieve a published post by its slug."),
		mcp.WithString("slug",
			mcp.Required(),
			mcp.Description("The slug of the post to retrieve."),
		),
	)
}

func updateTool() mcp.Tool {
	return mcp.NewTool("sho_update",
		mcp.WithDescription("Update the content of an existing post. Requires the edit_token or password as credential."),
		mcp.WithString("slug",
			mcp.Required(),
			mcp.Description("Slug of the post to update."),
		),
		mcp.WithString("content",
			mcp.Required(),
			mcp.Description("New content for the post."),
		),
		mcp.WithString("credential",
			mcp.Required(),
			mcp.Description("edit_token (for owner-only) or password (for password-protected posts)."),
		),
		mcp.WithString("edited_by",
			mcp.Description("Optional identifier for the editor (e.g. 'mcp-client')."),
		),
	)
}

func deleteTool() mcp.Tool {
	return mcp.NewTool("sho_delete",
		mcp.WithDescription("Soft-delete a post. Requires the edit_token."),
		mcp.WithString("slug",
			mcp.Required(),
			mcp.Description("Slug of the post to delete."),
		),
		mcp.WithString("edit_token",
			mcp.Required(),
			mcp.Description("The edit_token received when the post was created."),
		),
	)
}

func listTool() mcp.Tool {
	return mcp.NewTool("sho_list",
		mcp.WithDescription("List the most recent public posts."),
		mcp.WithNumber("limit",
			mcp.Description("Maximum number of posts to return (1–100, default 20)."),
		),
		mcp.WithNumber("offset",
			mcp.Description("Pagination offset (default 0)."),
		),
	)
}

// ---- handlers ---------------------------------------------------------------

func publishHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		content := req.GetString("content", "")
		if content == "" {
			return mcp.NewToolResultError("content is required"), nil
		}

		formatStr := req.GetString("format", "auto")
		var fmt_ model.Format
		switch formatStr {
		case "html":
			fmt_ = model.FormatHTML
		case "txt":
			fmt_ = model.FormatTXT
		case "jsx":
			fmt_ = model.FormatJSX
		case "markdown":
			fmt_ = model.FormatMarkdown
		case "auto", "":
			fmt_ = service.DetectFormat(content)
		default:
			fmt_ = service.DetectFormat(content)
		}

		policyStr := req.GetString("policy", "open")
		var pol model.Policy
		switch policyStr {
		case "locked":
			pol = model.PolicyLocked
		case "password":
			pol = model.PolicyPassword
		case "owner-only":
			pol = model.PolicyOwnerOnly
		case "ai-review":
			pol = model.PolicyAIReview
		default:
			pol = model.PolicyOpen
		}

		vpStr := req.GetString("view_policy", "open")
		var vp model.ViewPolicy
		switch vpStr {
		case "password":
			vp = model.ViewPolicyPassword
		case "human-qa":
			vp = model.ViewPolicyHumanQA
		case "ai-qa":
			vp = model.ViewPolicyAIQA
		default:
			vp = model.ViewPolicyOpen
		}

		input := service.CreatePostInput{
			Content:    content,
			Format:     fmt_,
			Policy:     pol,
			ViewPolicy: vp,
		}

		if title := req.GetString("title", ""); title != "" {
			input.Title = &title
		}
		if password := req.GetString("password", ""); password != "" {
			input.Password = &password
		}
		if vpw := req.GetString("view_password", ""); vpw != "" {
			input.ViewPassword = &vpw
		}
		if vqq := req.GetString("view_qa_question", ""); vqq != "" {
			input.ViewQAQuestion = &vqq
		}
		if vqa := req.GetString("view_qa_answer", ""); vqa != "" {
			input.ViewQAAnswer = &vqa
		}
		resp, err := svc.CreatePost(ctx, input)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("create post: %v", err)), nil
		}

		data, err := json.Marshal(resp)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal response: %v", err)), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	}
}

func getHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		slug, err := req.RequireString("slug")
		if err != nil {
			return mcp.NewToolResultError("slug is required"), nil
		}

		post, err := svc.GetPost(ctx, slug)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("get post: %v", err)), nil
		}

		data, err := json.Marshal(post)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal response: %v", err)), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	}
}

func updateHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		slug, err := req.RequireString("slug")
		if err != nil {
			return mcp.NewToolResultError("slug is required"), nil
		}
		content, err := req.RequireString("content")
		if err != nil {
			return mcp.NewToolResultError("content is required"), nil
		}
		credential, err := req.RequireString("credential")
		if err != nil {
			return mcp.NewToolResultError("credential is required"), nil
		}

		editedBy := req.GetString("edited_by", "mcp-client")

		input := service.UpdatePostInput{
			Slug:       slug,
			Content:    content,
			Credential: credential,
			EditedBy:   editedBy,
		}

		if err := svc.UpdatePost(ctx, input); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("update post: %v", err)), nil
		}

		return mcp.NewToolResultText(`{"ok":true}`), nil
	}
}

func deleteHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		slug, err := req.RequireString("slug")
		if err != nil {
			return mcp.NewToolResultError("slug is required"), nil
		}
		editToken, err := req.RequireString("edit_token")
		if err != nil {
			return mcp.NewToolResultError("edit_token is required"), nil
		}

		if err := svc.DeletePost(ctx, slug, editToken); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("delete post: %v", err)), nil
		}

		return mcp.NewToolResultText(`{"ok":true}`), nil
	}
}

func listHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		limit := req.GetInt("limit", 20)
		offset := req.GetInt("offset", 0)

		posts, err := svc.ListPosts(ctx, limit, offset, "")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("list posts: %v", err)), nil
		}

		data, err := json.Marshal(posts)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal response: %v", err)), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	}
}

func likeTool() mcp.Tool {
	return mcp.NewTool("sho_like",
		mcp.WithDescription("Like a post. One like per caller (deduplicated)."),
		mcp.WithString("slug",
			mcp.Required(),
			mcp.Description("The slug of the post to like."),
		),
	)
}

func likeHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		slug, err := req.RequireString("slug")
		if err != nil {
			return mcp.NewToolResultError("slug is required"), nil
		}

		likes, alreadyLiked, err := svc.LikePost(ctx, slug, "mcp-client")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("like post: %v", err)), nil
		}

		data, _ := json.Marshal(map[string]any{"likes": likes, "already_liked": alreadyLiked})
		return mcp.NewToolResultText(string(data)), nil
	}
}

func commentTool() mcp.Tool {
	return mcp.NewTool("sho_comment",
		mcp.WithDescription("Add a comment to a post. Supports threaded replies."),
		mcp.WithString("slug",
			mcp.Required(),
			mcp.Description("The slug of the post to comment on."),
		),
		mcp.WithString("content",
			mcp.Required(),
			mcp.Description("The comment text."),
		),
		mcp.WithString("parent_id",
			mcp.Description("ID of the parent comment to reply to (optional, max 2 levels)."),
		),
	)
}

func commentHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		slug, err := req.RequireString("slug")
		if err != nil {
			return mcp.NewToolResultError("slug is required"), nil
		}
		content, err := req.RequireString("content")
		if err != nil {
			return mcp.NewToolResultError("content is required"), nil
		}

		var parentID *uuid.UUID
		if pid := req.GetString("parent_id", ""); pid != "" {
			parsed, err := uuid.Parse(pid)
			if err != nil {
				return mcp.NewToolResultError("invalid parent_id"), nil
			}
			parentID = &parsed
		}

		comment, err := svc.AddComment(ctx, slug, content, parentID)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("add comment: %v", err)), nil
		}

		data, _ := json.Marshal(comment)
		return mcp.NewToolResultText(string(data)), nil
	}
}

func listCommentsTool() mcp.Tool {
	return mcp.NewTool("sho_list_comments",
		mcp.WithDescription("List all comments on a post."),
		mcp.WithString("slug",
			mcp.Required(),
			mcp.Description("The slug of the post."),
		),
	)
}

func listCommentsHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		slug, err := req.RequireString("slug")
		if err != nil {
			return mcp.NewToolResultError("slug is required"), nil
		}

		comments, err := svc.ListComments(ctx, slug)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("list comments: %v", err)), nil
		}

		data, _ := json.Marshal(comments)
		return mcp.NewToolResultText(string(data)), nil
	}
}
