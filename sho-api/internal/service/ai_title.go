package service

import (
	"context"
	"log"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/atompilot/sho-api/internal/llm"
	"github.com/atompilot/sho-api/internal/store"
)

const aiTitlePrompt = `You are a title generator. Given the content below, generate a concise title (3-50 characters).
Rules:
- Match the language of the content (Chinese content → Chinese title, English → English, etc.)
- For code/JSX/HTML: describe what the code does (e.g. "React Counter Component")
- For prose: capture the main idea
- Output ONLY the title text, no quotes, no explanation`

type AITitleWorker struct {
	store    *store.PostStore
	llm      *llm.Client
	interval time.Duration
}

func NewAITitleWorker(store *store.PostStore, llm *llm.Client, interval time.Duration) *AITitleWorker {
	return &AITitleWorker{
		store:    store,
		llm:      llm,
		interval: interval,
	}
}

func (w *AITitleWorker) Run(ctx context.Context) {
	log.Printf("ai-title worker started (interval=%s)", w.interval)

	// Run immediately on start, then on ticker.
	w.process(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("ai-title worker stopped")
			return
		case <-ticker.C:
			w.process(ctx)
		}
	}
}

func (w *AITitleWorker) process(ctx context.Context) {
	posts, err := w.store.ListPendingAITitle(ctx, 10)
	if err != nil {
		log.Printf("ai-title: list pending: %v", err)
		return
	}
	if len(posts) == 0 {
		return
	}

	for _, p := range posts {
		if ctx.Err() != nil {
			return
		}

		// Skip short content — not enough text to generate a meaningful title.
		if utf8.RuneCountInString(p.Content) < 20 {
			if err := w.store.UpdateAITitle(ctx, p.ID, ""); err != nil {
				log.Printf("ai-title: slug=%s mark short skip: %v", p.Slug, err)
			}
			continue
		}

		content := truncateRunes(p.Content, 2000)
		var title string
		var lastErr error

		for attempt := 0; attempt < 3; attempt++ {
			title, lastErr = w.llm.Chat(ctx, []llm.Message{
				{Role: "system", Content: aiTitlePrompt},
				{Role: "user", Content: content},
			})
			if lastErr == nil {
				break
			}
			log.Printf("ai-title: slug=%s attempt=%d err=%v", p.Slug, attempt+1, lastErr)
			// Brief pause before retry.
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
		}

		if lastErr != nil {
			log.Printf("ai-title: slug=%s failed after 3 attempts: %v", p.Slug, lastErr)
			continue
		}

		title = cleanTitle(title)
		if title == "" {
			log.Printf("ai-title: slug=%s empty title from LLM, skipping", p.Slug)
			continue
		}

		if err := w.store.UpdateAITitle(ctx, p.ID, title); err != nil {
			log.Printf("ai-title: slug=%s update: %v", p.Slug, err)
			continue
		}

		log.Printf("ai-title: slug=%s title=%q", p.Slug, title)
	}
}

// truncateRunes truncates s to at most maxRunes runes.
func truncateRunes(s string, maxRunes int) string {
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes])
}

// cleanTitle trims whitespace, removes wrapping quotes, and truncates to 50 chars.
func cleanTitle(s string) string {
	s = strings.TrimSpace(s)
	// Remove wrapping quotes (single, double, backtick, or CJK quotes).
	for _, pair := range [][2]rune{
		{'"', '"'}, {'\'', '\''}, {'`', '`'},
		{'\u201c', '\u201d'}, {'\u300c', '\u300d'},
	} {
		if len([]rune(s)) >= 2 {
			runes := []rune(s)
			if runes[0] == pair[0] && runes[len(runes)-1] == pair[1] {
				s = string(runes[1 : len(runes)-1])
				break
			}
		}
	}
	s = strings.TrimSpace(s)
	// Truncate to 50 characters.
	runes := []rune(s)
	if len(runes) > 50 {
		s = string(runes[:50])
	}
	return s
}
