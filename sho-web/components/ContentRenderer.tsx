'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  // 'txt' kept for backward compat with existing DB records; rendered as markdown
  format: 'markdown' | 'html' | 'txt' | 'jsx' | 'svg' | 'csv' | 'json' | 'lottie' | 'p5' | 'reveal' | 'glsl' | 'image'
  mode: 'preview' | 'source'
}

// Prevent </script inside user code from closing outer tag in srcdoc
const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')

// ── JSX srcdoc builder ───────────────────────────────────────────────────────

export function buildJsxSrcdoc(content: string): string {
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

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>
  html,body,#root{margin:0;padding:0;width:100%;height:100%;overflow:auto}
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

// ── HTML srcdoc builder ──────────────────────────────────────────────────────

export function buildHtmlSrcdoc(content: string): string {
  // If the content already contains <html or <!DOCTYPE, use it as-is but inject base styles
  if (/^\s*(<(!DOCTYPE|html))/i.test(content)) {
    // Inject a base style reset into the existing <head> if present
    const baseStyle = '<style>html,body{margin:0;padding:0;width:100%;height:100%}</style>'
    if (/<head[^>]*>/i.test(content)) {
      return content.replace(/(<head[^>]*>)/i, `$1${baseStyle}`)
    }
    return content
  }
  // Wrap partial HTML with full-screen base styles
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;width:100%;height:100%}</style>
</head><body>${content}</body></html>`
}

// ── SVG srcdoc builder ───────────────────────────────────────────────────────

export function buildSvgSrcdoc(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f5f5f5;overflow:hidden}
svg{width:90%;max-height:90%;height:auto}</style></head>
<body>${content}</body></html>`
}

// ── Lottie srcdoc builder ────────────────────────────────────────────────────

export function buildLottieSrcdoc(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a2e}
#c{width:100%;height:100%;max-width:600px;max-height:600px}</style></head>
<body><div id="c"></div>
<script src="https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js"><\/script>
<script>
try{
  lottie.loadAnimation({container:document.getElementById('c'),renderer:'svg',loop:true,autoplay:true,animationData:${safe(content)}});
}catch(e){document.body.innerHTML='<pre style="color:red;padding:16px">'+e+'</pre>'}
<\/script></body></html>`
}

// ── P5.js srcdoc builder ─────────────────────────────────────────────────────

export function buildP5Srcdoc(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head>
<body>
<script src="https://cdn.jsdelivr.net/npm/p5@1.9.4/lib/p5.min.js"><\/script>
<script>
try{
${safe(content)}
}catch(e){document.body.innerHTML='<pre style="color:red;padding:16px">'+e+'</pre>'}
<\/script></body></html>`
}

// ── Reveal.js srcdoc builder ─────────────────────────────────────────────────

export function buildRevealSrcdoc(content: string): string {
  const slides = content.split(/^---$/m)
    .map(s => `<section data-markdown><textarea data-template>${s.trim()}</textarea></section>`)
    .join('\n')
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/black.css">
<style>html,body{margin:0;height:100%;overflow:hidden}.reveal{height:100vh}</style>
</head><body>
<div class="reveal"><div class="slides">${slides}</div></div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/markdown/markdown.js"><\/script>
<script>Reveal.initialize({plugins:[RevealMarkdown],hash:true})<\/script>
</body></html>`
}

// ── GLSL srcdoc builder ──────────────────────────────────────────────────────

export function buildGlslSrcdoc(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body,canvas{margin:0;width:100%;height:100%;display:block;overflow:hidden;background:#000}</style>
</head><body>
<canvas id="c"></canvas>
<script>
const canvas=document.getElementById('c');
const gl=canvas.getContext('webgl')||canvas.getContext('experimental-webgl');
if(!gl){document.body.innerHTML='<p style="color:red;padding:16px">WebGL not supported</p>';}
else{
const VS=\`attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}\`;
const FS=\`precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
${safe(content)}\`;
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.error(gl.getShaderInfoLog(s));}return s;}
const prog=gl.createProgram();
gl.attachShader(prog,shader(gl.VERTEX_SHADER,VS));
gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,FS));
gl.linkProgram(prog);
if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){document.body.innerHTML='<pre style="color:red;padding:16px">'+gl.getProgramInfoLog(prog)+'</pre>';}
else{
gl.useProgram(prog);
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
const uTime=gl.getUniformLocation(prog,'uTime');
const uRes=gl.getUniformLocation(prog,'uResolution');
const uMouse=gl.getUniformLocation(prog,'uMouse');
let mx=0,my=0;
document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;});
function resize(){canvas.width=innerWidth;canvas.height=innerHeight;gl.viewport(0,0,innerWidth,innerHeight);}
resize();window.addEventListener('resize',resize);
function loop(t){
  gl.uniform1f(uTime,t*0.001);
  gl.uniform2f(uRes,canvas.width,canvas.height);
  gl.uniform2f(uMouse,mx,my);
  gl.drawArrays(gl.TRIANGLES,0,3);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
}}
<\/script></body></html>`
}

// ── CSV inline renderer ──────────────────────────────────────────────────────

export function parseCSV(content: string): string[][] {
  return content.trim().split('\n').map(line => {
    const fields: string[] = []
    let field = ''
    let inQ = false
    for (const c of line) {
      if (c === '"') inQ = !inQ
      else if (c === ',' && !inQ) { fields.push(field); field = '' }
      else field += c
    }
    fields.push(field)
    return fields
  })
}

// ── JSON inline renderer ─────────────────────────────────────────────────────

export function formatJSON(content: string): { formatted: string; error?: string } {
  try {
    return { formatted: JSON.stringify(JSON.parse(content), null, 2) }
  } catch (e) {
    return { formatted: content, error: String(e) }
  }
}

// ── ContentRenderer ──────────────────────────────────────────────────────────

export function ContentRenderer({ content, format, mode }: Props) {
  // Source mode — full-screen dark code view
  if (mode === 'source') {
    return (
      <pre
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
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

  // iframe-based formats
  const iframeFormats = ['html', 'jsx', 'svg', 'lottie', 'p5', 'reveal', 'glsl'] as const
  type IframeFormat = typeof iframeFormats[number]
  if ((iframeFormats as readonly string[]).includes(format)) {
    let srcdoc: string
    switch (format as IframeFormat) {
      case 'jsx':    srcdoc = buildJsxSrcdoc(content); break
      case 'svg':    srcdoc = buildSvgSrcdoc(content); break
      case 'lottie': srcdoc = buildLottieSrcdoc(content); break
      case 'p5':     srcdoc = buildP5Srcdoc(content); break
      case 'reveal': srcdoc = buildRevealSrcdoc(content); break
      case 'glsl':   srcdoc = buildGlslSrcdoc(content); break
      default:       srcdoc = buildHtmlSrcdoc(content) // html
    }
    return (
      <iframe
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100vw',
          height: '100vh',
          border: 'none',
          zIndex: 10,
        }}
      />
    )
  }

  // Inline rendered formats share a base full-screen container style
  const base: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    overflowY: 'auto',
    zIndex: 10,
    background: 'white',
  }

  // Image format — full-screen centered
  if (format === 'image') {
    return (
      <div style={{
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}>
        <img src={content} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    )
  }

  // CSV — table view
  if (format === 'csv') {
    const rows = parseCSV(content)
    const [head, ...body] = rows
    const thStyle: React.CSSProperties = {
      padding: '8px 12px',
      background: '#f3f4f6',
      borderBottom: '2px solid #e5e7eb',
      textAlign: 'left',
      fontWeight: 600,
      fontSize: 13,
      whiteSpace: 'nowrap',
    }
    const tdStyle: React.CSSProperties = {
      padding: '7px 12px',
      borderBottom: '1px solid #e5e7eb',
      fontSize: 13,
    }
    return (
      <div style={{ ...base, fontFamily: 'system-ui,sans-serif' }}>
        <div style={{ overflowX: 'auto', padding: 24 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 14, margin: '0 auto' }}>
            <thead>
              <tr>{head.map((h, i) => <th key={i} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j} style={tdStyle}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // JSON — formatted pre block
  if (format === 'json') {
    const { formatted, error } = formatJSON(content)
    return (
      <div style={{ ...base, background: '#0d1117' }}>
        {error && (
          <div style={{ padding: '8px 16px', background: '#3d1a1a', color: '#f87171', fontSize: 12, fontFamily: 'monospace' }}>
            Parse error: {error}
          </div>
        )}
        <pre style={{
          margin: 0,
          padding: '32px',
          color: '#e6edf3',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {formatted}
        </pre>
      </div>
    )
  }

  // Markdown / TXT
  if (format === 'markdown' || format === 'txt') {
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

  // fallback plain text
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
