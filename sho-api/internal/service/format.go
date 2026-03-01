package service

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/atompilot/sho-api/internal/model"
)

// DetectFormat inspects content and returns the most likely format.
// Priority: Lottie → P5.js → JSX → GLSL → SVG → HTML → JSON → CSV → Markdown (default).
func DetectFormat(content string) model.Format {
	if detectLottie(content) {
		return model.FormatLottie
	}
	if detectP5(content) {
		return model.FormatP5
	}
	if detectJSX(content) {
		return model.FormatJSX
	}
	if detectGLSL(content) {
		return model.FormatGLSL
	}
	if detectSVG(content) {
		return model.FormatSVG
	}
	if detectHTML(content) {
		return model.FormatHTML
	}
	if detectJSON(content) {
		return model.FormatJSON
	}
	if detectCSV(content) {
		return model.FormatCSV
	}
	if detectMarkdown(content) {
		return model.FormatMarkdown
	}
	return model.FormatMarkdown
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

func isValidJSON(content string) bool {
	trimmed := strings.TrimSpace(content)
	if len(trimmed) == 0 {
		return false
	}
	var v interface{}
	return json.Unmarshal([]byte(trimmed), &v) == nil
}

// detectLottie: valid JSON with "layers" and "fr" fields (Lottie animation).
func detectLottie(content string) bool {
	trimmed := strings.TrimSpace(content)
	if !isValidJSON(trimmed) {
		return false
	}
	return strings.Contains(trimmed, `"layers"`) && strings.Contains(trimmed, `"fr"`)
}

// detectP5: contains function setup() and (function draw() or createCanvas).
func detectP5(content string) bool {
	return strings.Contains(content, "function setup()") &&
		(strings.Contains(content, "function draw()") || strings.Contains(content, "createCanvas"))
}

// detectGLSL: contains void main() and gl_FragColor or gl_FragCoord.
func detectGLSL(content string) bool {
	return strings.Contains(content, "void main()") &&
		(strings.Contains(content, "gl_FragColor") || strings.Contains(content, "gl_FragCoord"))
}

// detectSVG: trimmed content starts with <svg (case-insensitive).
func detectSVG(content string) bool {
	trimmed := strings.TrimSpace(content)
	lower := strings.ToLower(trimmed)
	return strings.HasPrefix(lower, "<svg") ||
		(strings.HasPrefix(lower, "<?xml") && strings.Contains(lower, "<svg"))
}

// detectJSON: first char is { or [ and content is valid JSON.
func detectJSON(content string) bool {
	trimmed := strings.TrimSpace(content)
	if len(trimmed) == 0 {
		return false
	}
	first := trimmed[0]
	if first != '{' && first != '[' {
		return false
	}
	return isValidJSON(trimmed)
}

// detectCSV: ≥2 lines, all lines have the same comma count (≥1), no HTML/JSON features.
func detectCSV(content string) bool {
	trimmed := strings.TrimSpace(content)
	lines := strings.Split(trimmed, "\n")
	if len(lines) < 2 {
		return false
	}
	// Skip if it looks like HTML or JSON
	lower := strings.ToLower(trimmed)
	if strings.Contains(lower, "<html") || strings.Contains(lower, "<!doctype") {
		return false
	}
	first := trimmed[0]
	if first == '{' || first == '[' {
		return false
	}
	// Count commas per line — must be consistent and ≥1
	commaCount := strings.Count(lines[0], ",")
	if commaCount < 1 {
		return false
	}
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.Count(line, ",") != commaCount {
			return false
		}
	}
	return true
}
