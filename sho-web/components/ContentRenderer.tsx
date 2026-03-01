'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useState } from 'react'

interface Props {
  content: string
  format: 'markdown' | 'html' | 'txt' | 'jsx'
}

// ── JSX srcdoc builder ───────────────────────────────────────────────────────

function buildJsxSrcdoc(content: string): string {
  // Transform ES imports from 'react' → UMD global React
  let code = content
    // import React, { useState } from 'react'  →  const { useState } = React
    .replace(
      /import\s+React\s*,\s*\{([^}]+)\}\s+from\s+['"]react['"]\s*;?/g,
      (_, named) => `const { ${named.trim()} } = React;`
    )
    // import { useState, useEffect } from 'react'  →  const { ... } = React
    .replace(
      /import\s*\{([^}]+)\}\s+from\s+['"]react['"]\s*;?/g,
      (_, named) => `const { ${named.trim()} } = React;`
    )
    // import React from 'react' / import * as React from 'react'  →  (noop)
    .replace(/import\s+(?:React|\*\s+as\s+React)\s+from\s+['"]react['"]\s*;?\n?/g, '')

  // Capture and strip 'export default function Foo' / 'export default class Foo'
  const namedDefaultMatch = code.match(
    /export\s+default\s+(function|class)\s+(\w+)/
  )
  const componentName = namedDefaultMatch?.[2] ?? null
  code = code.replace(/export\s+default\s+(?=function|class)/, '')

  // Capture and strip standalone 'export default Foo'
  const bareDefaultMatch = !componentName
    ? code.match(/export\s+default\s+(\w+)\s*;?\s*$/)
    : null
  const bareComponent = bareDefaultMatch?.[1] ?? null
  if (bareDefaultMatch) {
    code = code.replace(bareDefaultMatch[0], '')
  }

  const finalComponent = componentName ?? bareComponent
  const mountCode = finalComponent
    ? `ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${finalComponent}));`
    : `document.getElementById('root').innerHTML =
        '<p style="color:#888;font-size:13px">No default export found to render.</p>';`

  // Prevent </script> inside user code from closing the outer script tag in srcdoc
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>
  body { margin: 16px; font-family: system-ui, sans-serif; line-height: 1.5; }
  #err { color: #c00; font-size: 12px; white-space: pre-wrap; font-family: monospace; }
</style>
</head>
<body>
<div id="root"></div>
<div id="err"></div>
<script type="text/babel" data-presets="react">
try {
${safe(code)}
${safe(mountCode)}
} catch (e) {
  document.getElementById('err').textContent = String(e);
}
<\/script>
</body>
</html>`
}

// ── Shared primitives ────────────────────────────────────────────────────────

function ResizableIframe({ srcdoc }: { srcdoc: string }) {
  return (
    <div
      className="rounded border border-gray-200 overflow-hidden"
      style={{ resize: 'vertical', minHeight: 240, height: 480 }}
    >
      <iframe
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        className="w-full h-full"
        style={{ border: 0, display: 'block' }}
      />
    </div>
  )
}

function SourceView({ content }: { content: string }) {
  return (
    <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 bg-gray-50 dark:bg-gray-900 dark:text-gray-200 rounded border border-gray-200 p-4 overflow-auto">
      {content}
    </pre>
  )
}

function Tabs({
  content,
  preview,
}: {
  content: string
  preview: React.ReactNode
}) {
  const [tab, setTab] = useState<'preview' | 'source'>('preview')
  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(['preview', 'source'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
              tab === t
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {t === 'preview' ? 'Preview' : 'Source'}
          </button>
        ))}
      </div>
      {tab === 'preview' ? preview : <SourceView content={content} />}
    </div>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export function ContentRenderer({ content, format }: Props) {
  if (format === 'markdown') {
    return (
      <div className="prose prose-gray max-w-none dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    )
  }

  if (format === 'html') {
    return (
      <Tabs
        content={content}
        preview={<ResizableIframe srcdoc={content} />}
      />
    )
  }

  if (format === 'jsx') {
    return (
      <Tabs
        content={content}
        preview={<ResizableIframe srcdoc={buildJsxSrcdoc(content)} />}
      />
    )
  }

  // txt
  return <SourceView content={content} />
}
