package service

import (
	"regexp"
	"strings"

	"github.com/atompilot/sho-api/internal/model"
)

// DetectFormat inspects content and returns the most likely format.
// Priority: JSX > HTML > Markdown > TXT (default).
func DetectFormat(content string) model.Format {
	if detectJSX(content) {
		return model.FormatJSX
	}
	if detectHTML(content) {
		return model.FormatHTML
	}
	if detectMarkdown(content) {
		return model.FormatMarkdown
	}
	return model.FormatTXT
}

// JSX detection requires ≥2 signals to avoid false positives.
func detectJSX(content string) bool {
	signals := 0

	if reReactImport.MatchString(content) {
		signals++
	}
	if reExportDefault.MatchString(content) {
		signals++
	}
	if rePascalTag.MatchString(content) {
		signals++
	}
	if strings.Contains(content, "<>") || strings.Contains(content, "</>") {
		signals++ // fragment syntax
	}
	if reClassName.MatchString(content) {
		signals++
	}

	return signals >= 2
}

var (
	reReactImport = regexp.MustCompile(`(?m)import\s+.*from\s+['"]react['"]`)
	reExportDefault = regexp.MustCompile(`(?m)export\s+default\s+(function|class)\s+`)
	rePascalTag   = regexp.MustCompile(`<[A-Z][a-zA-Z0-9]+[\s/>]`)
	reClassName   = regexp.MustCompile(`className\s*=`)
)

func detectHTML(content string) bool {
	lower := strings.ToLower(content)

	// Strong signals — any one is enough.
	if strings.Contains(lower, "<!doctype html") {
		return true
	}
	for _, tag := range []string{"<html", "<head", "<body"} {
		if strings.Contains(lower, tag) {
			return true
		}
	}

	// Weaker signal: starts with < and contains common HTML tags.
	trimmed := strings.TrimSpace(content)
	if strings.HasPrefix(trimmed, "<") {
		for _, tag := range []string{"<div", "<span", "<p>", "<h1", "<h2", "<h3", "<ul", "<ol", "<table", "<form", "<a ", "<img", "<section", "<article", "<nav", "<header", "<footer", "<title"} {
			if strings.Contains(lower, tag) {
				return true
			}
		}
	}

	return false
}

var (
	reHeading   = regexp.MustCompile(`(?m)^#{1,6}\s+\S`)
	reCodeBlock = regexp.MustCompile("(?m)^```")
	reBold      = regexp.MustCompile(`\*\*[^*]+\*\*`)
	reMdLink    = regexp.MustCompile(`\[[^\]]+\]\([^)]+\)`)
	reMdList    = regexp.MustCompile(`(?m)^[-*+]\s+\S`)
)

func detectMarkdown(content string) bool {
	// Heading is a strong signal — instant match.
	if reHeading.MatchString(content) {
		return true
	}

	signals := 0
	if reCodeBlock.MatchString(content) {
		signals++
	}
	if reBold.MatchString(content) {
		signals++
	}
	if reMdLink.MatchString(content) {
		signals++
	}
	if reMdList.MatchString(content) {
		signals++
	}

	return signals >= 1
}
