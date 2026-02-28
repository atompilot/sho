package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/service"
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
			mcp.Description("Content format: markdown, html, txt (default: markdown)."),
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
		mcp.WithString("slug",
			mcp.Description("Custom slug (auto-generated if omitted)."),
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

		formatStr := req.GetString("format", "markdown")
		var fmt_ model.Format
		switch formatStr {
		case "html":
			fmt_ = model.FormatHTML
		case "txt":
			fmt_ = model.FormatTXT
		case "jsx":
			fmt_ = model.FormatJSX
		default:
			fmt_ = model.FormatMarkdown
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

		input := service.CreatePostInput{
			Content: content,
			Format:  fmt_,
			Policy:  pol,
		}

		if title := req.GetString("title", ""); title != "" {
			input.Title = &title
		}
		if password := req.GetString("password", ""); password != "" {
			input.Password = &password
		}
		if slug := req.GetString("slug", ""); slug != "" {
			input.Slug = &slug
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

		posts, err := svc.ListPosts(ctx, limit, offset)
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
