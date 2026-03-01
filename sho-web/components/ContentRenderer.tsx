'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  format: 'markdown' | 'html' | 'txt' | 'jsx'
  mode: 'preview' | 'source'
}

// ── JSX srcdoc builder ───────────────────────────────────────────────────────

function buildJsxSrcdoc(content: string): string {
  // Transform ES imports from 'react' → UMD global React
  let code = content
    .replace(
      /import\s+React\s*,\s*\{([^}]+)\}\s+from\s+['"]react['"]\s*;?/g,
      (_, named) => `const { ${named.trim()} } = React;`
    )
    .replace(
      /import\s*\{([^}]+)\}\s+from\s+['"]react['"]\s*;?/g,
      (_, named) => `const { ${named.trim()} } = React;`
    )
    .replace(/import\s+(?:React|\*\s+as\s+React)\s+from\s+['"]react['"]\s*;?\n?/g, '')

  // Capture + strip 'export default function/class Foo'
  const namedMatch = code.match(/export\s+default\s+(function|class)\s+(\w+)/)
  const componentName = namedMatch?.[2] ?? null
  code = code.replace(/export\s+default\s+(?=function|class)/, '')

  // Capture + strip bare 'export default Foo'
  const bareMatch = !componentName
    ? code.match(/export\s+default\s+(\w+)\s*;?\s*$/)
    : null
  const bareComponent = bareMatch?.[1] ?? null
  if (bareMatch) code = code.replace(bareMatch[0], '')

  const final = componentName ?? bareComponent
  const mountCode = final
    ? `ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${final}));`
    : `document.getElementById('root').innerHTML =
        '<p style="color:#888;font-size:13px;padding:16px">No default export found to render.</p>';`

  // Prevent </script inside user code from closing outer tag in srcdoc
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
  html,body{margin:0;padding:0;width:100%;height:100%}
  body{font-family:system-ui,sans-serif;line-height:1.5}
  #err{color:#c00;font-size:12px;white-space:pre-wrap;font-family:monospace;padding:16px}
</style>
</head>
<body>
<div id="root"></div>
<div id="err"></div>
<script type="text/babel" data-presets="react">
try{
${safe(code)}
${safe(mountCode)}
}catch(e){document.getElementById('err').textContent=String(e)}
<\/script>
</body>
</html>`
}

// ── ContentRenderer ──────────────────────────────────────────────────────────

export function ContentRenderer({ content, format, mode }: Props) {
  // Source mode — full-screen dark code view
  if (mode === 'source') {
    return (
      <pre
        style={{
          position: 'fixed',
          inset: 0,
          margin: 0,
          padding: '32px',
          overflow: 'auto',
          background: '#0d1117',
          color: '#e6edf3',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          zIndex: 10,
        }}
      >
        {content}
      </pre>
    )
  }

  // HTML / JSX — full-screen iframe
  if (format === 'html' || format === 'jsx') {
    const srcdoc = format === 'jsx' ? buildJsxSrcdoc(content) : content
    return (
      <iframe
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          zIndex: 10,
        }}
      />
    )
  }

  // Markdown / TXT — full-screen scrollable reading view
  const base: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    overflowY: 'auto',
    zIndex: 10,
    background: 'white',
  }

  if (format === 'markdown') {
    return (
      <div style={base}>
        <div
          className="prose prose-gray max-w-3xl mx-auto dark:prose-invert"
          style={{ padding: '48px 24px' }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    )
  }

  // txt
  return (
    <div style={base}>
      <pre
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '48px 24px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </pre>
    </div>
  )
}
