package service

import (
	"testing"

	"github.com/atompilot/sho-api/internal/model"
)

func TestExtractTitle(t *testing.T) {
	tests := []struct {
		name    string
		content string
		format  model.Format
		want    string
	}{
		// Markdown
		{
			name:    "markdown heading",
			content: "# Hello World\nSome body text",
			format:  model.FormatMarkdown,
			want:    "Hello World",
		},
		{
			name:    "markdown h2",
			content: "## Section Title\nParagraph",
			format:  model.FormatMarkdown,
			want:    "Section Title",
		},
		{
			name:    "markdown no heading",
			content: "Just a plain first line\nAnd more",
			format:  model.FormatMarkdown,
			want:    "Just a plain first l…",
		},
		{
			name:    "markdown leading blank lines",
			content: "\n\n  \n# Title After Blanks",
			format:  model.FormatMarkdown,
			want:    "Title After Blanks",
		},
		{
			name:    "markdown long title truncated",
			content: "# This Is A Very Long Title That Exceeds Twenty Characters",
			format:  model.FormatMarkdown,
			want:    "This Is A Very Long …",
		},
		{
			name:    "markdown empty",
			content: "",
			format:  model.FormatMarkdown,
			want:    "",
		},
		// TXT
		{
			name:    "txt first line",
			content: "Hello plain text\nMore lines",
			format:  model.FormatTXT,
			want:    "Hello plain text",
		},
		{
			name:    "txt long line",
			content: "A very long first line that should be truncated at twenty chars",
			format:  model.FormatTXT,
			want:    "A very long first li…",
		},
		// HTML
		{
			name:    "html with title tag",
			content: "<html><head><title>My Page Title</title></head><body>Hello</body></html>",
			format:  model.FormatHTML,
			want:    "My Page Title",
		},
		{
			name:    "html title case insensitive",
			content: "<TITLE>Upper Case</TITLE>",
			format:  model.FormatHTML,
			want:    "Upper Case",
		},
		{
			name:    "html no title tag",
			content: "<html><body><h1>No Title Tag</h1></body></html>",
			format:  model.FormatHTML,
			want:    "",
		},
		{
			name:    "html long title",
			content: "<title>This Title Is Definitely Way Too Long</title>",
			format:  model.FormatHTML,
			want:    "This Title Is Defini…",
		},
		// JSX
		{
			name:    "jsx export default function",
			content: "import React from 'react';\n\nexport default function NeuralNetworkViz() {\n  return <div>Hello</div>;\n}",
			format:  model.FormatJSX,
			want:    "NeuralNetworkViz",
		},
		{
			name:    "jsx export default class",
			content: "import React from 'react';\n\nexport default class MyComponent extends React.Component {\n  render() { return <div/>; }\n}",
			format:  model.FormatJSX,
			want:    "MyComponent",
		},
		{
			name:    "jsx no export default fallback to first line",
			content: "const App = () => <div>Hello</div>;\nexport default App;",
			format:  model.FormatJSX,
			want:    "const App = () => <d…",
		},
		{
			name:    "jsx long component name",
			content: "export default function VeryLongComponentNameThatExceedsTwentyChars() {}",
			format:  model.FormatJSX,
			want:    "VeryLongComponentNam…",
		},
		// Chinese content
		{
			name:    "markdown chinese short",
			content: "# 你好世界",
			format:  model.FormatMarkdown,
			want:    "你好世界",
		},
		{
			name:    "markdown chinese over 20 runes",
			content: "# 这是一个非常长的中文标题超过二十个字符的情况",
			format:  model.FormatMarkdown,
			want:    "这是一个非常长的中文标题超过二十个字符的…",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractTitle(tt.content, tt.format)
			if got != tt.want {
				t.Errorf("extractTitle() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestTruncateTitle(t *testing.T) {
	tests := []struct {
		input  string
		maxLen int
		want   string
	}{
		{"short", 20, "short"},
		{"exactly twenty chars!", 20, "exactly twenty chars…"},
		{"hello", 5, "hello"},
		{"hello!", 5, "hello…"},
		{"你好世界", 3, "你好世…"},
		{"", 20, ""},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := truncateTitle(tt.input, tt.maxLen)
			if got != tt.want {
				t.Errorf("truncateTitle(%q, %d) = %q, want %q", tt.input, tt.maxLen, got, tt.want)
			}
		})
	}
}
