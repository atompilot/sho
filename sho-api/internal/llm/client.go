package llm

import (
	"context"
	"errors"
	"fmt"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/packages/ssestream"
)

var (
	ErrNoChoices   = errors.New("llm returned no choices")
	ErrInvalidRole = errors.New("invalid message role")
)

var validRoles = map[string]bool{
	"system":    true,
	"user":      true,
	"assistant": true,
}

type Client struct {
	client openai.Client
	model  string
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func NewClient(apiKey, baseURL, model string) *Client {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	c := openai.NewClient(opts...)
	return &Client{
		client: c,
		model:  model,
	}
}

func (c *Client) Chat(ctx context.Context, messages []Message) (string, error) {
	oaiMsgs, err := toOpenAIMessages(messages)
	if err != nil {
		return "", err
	}
	resp, err := c.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:    openai.ChatModel(c.model),
		Messages: oaiMsgs,
	})
	if err != nil {
		return "", fmt.Errorf("llm chat: %w", err)
	}
	if len(resp.Choices) == 0 {
		return "", ErrNoChoices
	}
	return resp.Choices[0].Message.Content, nil
}

type Stream struct {
	stream *ssestream.Stream[openai.ChatCompletionChunk]
}

func (c *Client) ChatStream(ctx context.Context, messages []Message) (*Stream, error) {
	oaiMsgs, err := toOpenAIMessages(messages)
	if err != nil {
		return nil, err
	}
	stream := c.client.Chat.Completions.NewStreaming(ctx, openai.ChatCompletionNewParams{
		Model:    openai.ChatModel(c.model),
		Messages: oaiMsgs,
	})
	return &Stream{stream: stream}, nil
}

func (s *Stream) Next() bool {
	return s.stream.Next()
}

func (s *Stream) Current() string {
	chunk := s.stream.Current()
	if len(chunk.Choices) > 0 {
		return chunk.Choices[0].Delta.Content
	}
	return ""
}

func (s *Stream) Err() error {
	return s.stream.Err()
}

func (s *Stream) Close() {
	s.stream.Close()
}

func ValidateMessages(msgs []Message) error {
	for i, m := range msgs {
		if !validRoles[m.Role] {
			return fmt.Errorf("%w: messages[%d].role=%q", ErrInvalidRole, i, m.Role)
		}
	}
	return nil
}

func toOpenAIMessages(msgs []Message) ([]openai.ChatCompletionMessageParamUnion, error) {
	if err := ValidateMessages(msgs); err != nil {
		return nil, err
	}
	out := make([]openai.ChatCompletionMessageParamUnion, len(msgs))
	for i, m := range msgs {
		switch m.Role {
		case "system":
			out[i] = openai.SystemMessage(m.Content)
		case "assistant":
			out[i] = openai.AssistantMessage(m.Content)
		case "user":
			out[i] = openai.UserMessage(m.Content)
		}
	}
	return out, nil
}
