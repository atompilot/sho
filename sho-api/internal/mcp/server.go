package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/atompilot/sho-api/internal/service"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// NewMCPServer creates an MCPServer with all Sho tools registered.
func NewMCPServer(postSvc *service.PostService, llmClient service.LLMChatter, webhookStore *store.WebhookStore, channelStore *store.ChannelStore) *mcpserver.MCPServer {
	s := mcpserver.NewMCPServer("sho", "1.0.0",
		mcpserver.WithToolCapabilities(true),
		mcpserver.WithRecovery(),
		mcpserver.WithInstructions("Sho is a content publishing platform. Use these tools to publish, read, update, delete, like, comment on posts, and manage channels."),
	)

	s.AddTool(publishTool(), publishHandler(postSvc, webhookStore))
	s.AddTool(getTool(), getHandler(postSvc))
	s.AddTool(updateTool(), updateHandler(postSvc, llmClient))
	s.AddTool(deleteTool(), deleteHandler(postSvc))
	s.AddTool(listTool(), listHandler(postSvc))
	s.AddTool(likeTool(), likeHandler(postSvc))
	s.AddTool(commentTool(), commentHandler(postSvc))
	s.AddTool(listCommentsTool(), listCommentsHandler(postSvc))
	s.AddTool(listByAgentTool(), listByAgentHandler(postSvc))
	if channelStore != nil {
		s.AddTool(createChannelTool(), createChannelHandler(channelStore))
	}

	return s
}

// HTTPServer creates a stateless StreamableHTTP server at "/mcp".
func HTTPServer(s *mcpserver.MCPServer) *mcpserver.StreamableHTTPServer {
	return mcpserver.NewStreamableHTTPServer(s,
		mcpserver.WithEndpointPath("/mcp"),
		mcpserver.WithStateLess(true),
	)
}

// ---- tool definitions -------------------------------------------------------

func publishTool() mcp.Tool {
	return mcp.NewTool("sho_publish",
		mcp.WithDescription("Publish new content to Sho. Returns slug, password, and title."),
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
			mcp.Description("Access policy: open, password, owner-only, ai-review (default: password)."),
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
		mcp.WithString("view_qa_prompt",
			mcp.Description("Custom AI judgment prompt for ai-qa view policy. Instructs how the AI should evaluate answers."),
		),
		mcp.WithString("view_qa_answer",
			mcp.Description("Answer for human-qa view policy (exact match)."),
		),
		mcp.WithBoolean("unlisted",
			mcp.Description("If true, post won't appear in lists/search/explore. Only accessible via direct link (default: false)."),
		),
		mcp.WithString("agent_id",
			mcp.Description("Optional agent identifier for attribution (e.g. 'research-bot-001')."),
		),
		mcp.WithString("agent_name",
			mcp.Description("Optional human-readable agent name (e.g. 'Research Bot')."),
		),
		mcp.WithString("webhook_url",
			mcp.Description("Optional webhook URL to receive notifications when the post is liked or commented on."),
		),
		mcp.WithString("channel",
			mcp.Description("Optional channel name to publish into (channel must exist first)."),
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
		mcp.WithDescription("Update the content of an existing post. Requires the password or master password as credential."),
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
			mcp.Description("Password for password-protected posts, or master password."),
		),
		mcp.WithString("edited_by",
			mcp.Description("Optional identifier for the editor (e.g. 'mcp-client')."),
		),
	)
}

func deleteTool() mcp.Tool {
	return mcp.NewTool("sho_delete",
		mcp.WithDescription("Soft-delete a post. Requires the password or master password."),
		mcp.WithString("slug",
			mcp.Required(),
			mcp.Description("Slug of the post to delete."),
		),
		mcp.WithString("credential",
			mcp.Required(),
			mcp.Description("Password for password-protected posts, or master password."),
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

func publishHandler(svc *service.PostService, webhookStore *store.WebhookStore) mcpserver.ToolHandlerFunc {
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

		policyStr := req.GetString("policy", "password")
		var pol model.Policy
		switch policyStr {
		case "open":
			pol = model.PolicyOpen
		case "owner-only":
			pol = model.PolicyOwnerOnly
		case "ai-review":
			pol = model.PolicyAIReview
		default:
			pol = model.PolicyPassword
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
		if vqp := req.GetString("view_qa_prompt", ""); vqp != "" {
			input.ViewQAPrompt = &vqp
		}
		if vqa := req.GetString("view_qa_answer", ""); vqa != "" {
			input.ViewQAAnswer = &vqa
		}
		if req.GetBool("unlisted", false) {
			input.Unlisted = true
		}
		if aid := req.GetString("agent_id", ""); aid != "" {
			input.AgentID = &aid
		}
		if aname := req.GetString("agent_name", ""); aname != "" {
			input.AgentName = &aname
		}
		if wurl := req.GetString("webhook_url", ""); wurl != "" {
			input.WebhookURL = &wurl
		}
		if ch := req.GetString("channel", ""); ch != "" {
			input.Channel = &ch
		}
		resp, err := svc.CreatePost(ctx, input)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("create post: %v", err)), nil
		}

		// Register webhook if provided
		if input.WebhookURL != nil && *input.WebhookURL != "" && webhookStore != nil {
			wh := &store.Webhook{
				ID:          uuid.New(),
				PostSlug:    resp.Slug,
				EndpointURL: *input.WebhookURL,
				Events:      []string{"post.updated", "post.liked", "comment.created"},
				IsActive:    true,
			}
			if whErr := webhookStore.Create(ctx, wh); whErr != nil {
				// Non-fatal: log but don't fail the publish
				_ = whErr
			}
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

func updateHandler(svc *service.PostService, llmClient service.LLMChatter) mcpserver.ToolHandlerFunc {
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

		if err := svc.UpdatePost(ctx, input, llmClient); err != nil {
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
		credential, err := req.RequireString("credential")
		if err != nil {
			return mcp.NewToolResultError("credential is required"), nil
		}

		if err := svc.DeletePost(ctx, slug, credential); err != nil {
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

func listByAgentTool() mcp.Tool {
	return mcp.NewTool("sho_list_by_agent",
		mcp.WithDescription("List posts published by a specific agent."),
		mcp.WithString("agent_id",
			mcp.Required(),
			mcp.Description("The agent identifier to filter by."),
		),
		mcp.WithNumber("limit",
			mcp.Description("Maximum number of posts to return (1–100, default 20)."),
		),
		mcp.WithNumber("offset",
			mcp.Description("Pagination offset (default 0)."),
		),
	)
}

func listByAgentHandler(svc *service.PostService) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		agentID, err := req.RequireString("agent_id")
		if err != nil {
			return mcp.NewToolResultError("agent_id is required"), nil
		}
		limit := req.GetInt("limit", 20)
		offset := req.GetInt("offset", 0)

		posts, err := svc.ListByAgent(ctx, agentID, limit, offset)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("list by agent: %v", err)), nil
		}

		data, err := json.Marshal(posts)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("marshal response: %v", err)), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	}
}

func createChannelTool() mcp.Tool {
	return mcp.NewTool("sho_create_channel",
		mcp.WithDescription("Create a named channel for organizing published content."),
		mcp.WithString("name",
			mcp.Required(),
			mcp.Description("URL-friendly channel name (e.g. 'research-weekly')."),
		),
		mcp.WithString("display_name",
			mcp.Description("Human-readable display name."),
		),
		mcp.WithString("description",
			mcp.Description("Channel description."),
		),
		mcp.WithString("agent_id",
			mcp.Description("Optional agent identifier to associate with this channel."),
		),
	)
}

func createChannelHandler(channelStore *store.ChannelStore) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		name, err := req.RequireString("name")
		if err != nil {
			return mcp.NewToolResultError("name is required"), nil
		}

		editToken, err := policy.GenerateToken(32)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("generate token: %v", err)), nil
		}

		ch := &model.Channel{
			ID:        uuid.New(),
			Name:      name,
			EditToken: editToken,
		}
		if dn := req.GetString("display_name", ""); dn != "" {
			ch.DisplayName = &dn
		}
		if desc := req.GetString("description", ""); desc != "" {
			ch.Description = &desc
		}
		if aid := req.GetString("agent_id", ""); aid != "" {
			ch.AgentID = &aid
		}

		if err := channelStore.Create(ctx, ch); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("create channel: %v", err)), nil
		}

		data, _ := json.Marshal(map[string]any{
			"id":         ch.ID,
			"name":       ch.Name,
			"edit_token": ch.EditToken,
			"created_at": ch.CreatedAt,
		})
		return mcp.NewToolResultText(string(data)), nil
	}
}
