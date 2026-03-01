package service

import (
	"regexp"
	"strings"

	"github.com/atompilot/sho-api/internal/model"
)

const maxTitleLen = 20

var (
	htmlTitleRe  = regexp.MustCompile(`(?i)<title[^>]*>(.*?)</title>`)
	jsxExportRe  = regexp.MustCompile(`export\s+default\s+(?:function|class)\s+(\w+)`)
	mdHeadingRe  = regexp.MustCompile(`^#+\s+`)
)

// extractTitle derives a title from content based on its format.
func extractTitle(content string, format model.Format) string {
	var raw string
	switch format {
	case model.FormatHTML:
		raw = extractHTMLTitle(content)
	case model.FormatJSX:
		raw = extractJSXTitle(content)
	default: // markdown, txt
		raw = extractFirstLine(content, format == model.FormatMarkdown)
	}
	if raw == "" {
		return ""
	}
	return truncateTitle(raw, maxTitleLen)
}

// extractFirstLine returns the first non-empty line.
// If stripHeading is true, leading markdown heading markers (###) are removed.
func extractFirstLine(content string, stripHeading bool) string {
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if stripHeading {
			trimmed = mdHeadingRe.ReplaceAllString(trimmed, "")
		}
		return trimmed
	}
	return ""
}

// extractHTMLTitle extracts text from the first <title>...</title> tag.
func extractHTMLTitle(content string) string {
	m := htmlTitleRe.FindStringSubmatch(content)
	if len(m) >= 2 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// extractJSXTitle extracts the default export component name,
// falling back to the first non-empty line.
func extractJSXTitle(content string) string {
	m := jsxExportRe.FindStringSubmatch(content)
	if len(m) >= 2 {
		return m[1]
	}
	return extractFirstLine(content, false)
}

// truncateTitle truncates s to maxLen runes, appending "…" if truncated.
func truncateTitle(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "…"
}
