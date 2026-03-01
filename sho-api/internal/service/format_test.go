package service

import (
	"testing"

	"github.com/atompilot/sho-api/internal/model"
)

func TestDetectFormat(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    model.Format
	}{
		// JSX
		{
			name: "jsx with import and export",
			content: `import React from 'react'

export default function App() {
  return <div className="app">Hello</div>
}`,
			want: model.FormatJSX,
		},
		{
			name: "jsx with PascalCase tag and className",
			content: `<MyComponent className="wrapper">
  <ChildWidget />
</MyComponent>`,
			want: model.FormatJSX,
		},
		{
			name: "jsx with fragment syntax and export",
			content: `export default function Page() {
  return <>
    <h1>Title</h1>
  </>
}`,
			want: model.FormatJSX,
		},
		{
			name: "jsx class component",
			content: `import { Component } from 'react'

export default class Counter extends Component {
  render() {
    return <span>{this.state.count}</span>
  }
}`,
			want: model.FormatJSX,
		},

		// HTML
		{
			name: "html with doctype",
			content: `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><p>Hello</p></body>
</html>`,
			want: model.FormatHTML,
		},
		{
			name: "html with body tag",
			content: `<html>
<body>
<h1>Hello</h1>
</body>
</html>`,
			want: model.FormatHTML,
		},
		{
			name: "html fragment starting with tag",
			content: `<div>
  <p>Some paragraph</p>
  <span>text</span>
</div>`,
			want: model.FormatHTML,
		},
		{
			name: "html with table",
			content: `<table>
  <tr><td>Cell</td></tr>
</table>`,
			want: model.FormatHTML,
		},

		// Markdown
		{
			name: "markdown heading",
			content: `# Hello World

Some text here.`,
			want: model.FormatMarkdown,
		},
		{
			name: "markdown code block",
			content: "Here is some code:\n\n```go\nfmt.Println(\"hello\")\n```\n",
			want: model.FormatMarkdown,
		},
		{
			name: "markdown bold",
			content: `This is **important** text.`,
			want: model.FormatMarkdown,
		},
		{
			name: "markdown link",
			content: `Check out [this site](https://example.com) for more.`,
			want: model.FormatMarkdown,
		},
		{
			name: "markdown list",
			content: `- item one
- item two
- item three`,
			want: model.FormatMarkdown,
		},
		{
			name: "markdown with embedded html treated as markdown",
			content: `# My Document

Some <em>inline</em> HTML is fine in markdown.`,
			want: model.FormatMarkdown,
		},

		// Plain text
		{
			name: "plain text",
			content: `Just a regular sentence without any special formatting.`,
			want: model.FormatTXT,
		},
		{
			name: "empty content",
			content: ``,
			want: model.FormatTXT,
		},
		{
			name: "multiline plain text",
			content: `Hello world
This is just some text
Nothing special here`,
			want: model.FormatTXT,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DetectFormat(tt.content)
			if got != tt.want {
				t.Errorf("DetectFormat() = %q, want %q", got, tt.want)
			}
		})
	}
}
