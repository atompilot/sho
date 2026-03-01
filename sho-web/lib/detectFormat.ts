export type DetectableFormat = 'markdown' | 'html' | 'jsx' | 'svg' | 'csv' | 'json' | 'lottie' | 'p5' | 'glsl'

/**
 * Detect content format from its text.
 * Priority: Lottie → P5.js → JSX → GLSL → SVG → HTML → JSON → CSV → Markdown (default)
 */
export function detectFormat(content: string): DetectableFormat {
  const s = content.trim()
  if (!s) return 'markdown'

  // Lottie: valid JSON with "layers" and "fr" fields
  if (isValidJSON(s) && s.includes('"layers"') && s.includes('"fr"')) return 'lottie'

  // P5.js: contains function setup() and (function draw() or createCanvas)
  if (s.includes('function setup()') && (s.includes('function draw()') || s.includes('createCanvas'))) return 'p5'

  // JSX: import/export statements or capital-letter component tags
  const isJsx =
    /^(import\s|export\s+(default\s+)?(function|class|const|let|var))/m.test(s) ||
    /\bReact\b/.test(s) ||
    /<[A-Z][A-Za-z]*[\s/>]/.test(s)
  if (isJsx) return 'jsx'

  // GLSL: contains void main() and gl_FragColor or gl_FragCoord
  if (s.includes('void main()') && (s.includes('gl_FragColor') || s.includes('gl_FragCoord'))) return 'glsl'

  // SVG: starts with <svg (case-insensitive) or <?xml containing <svg
  const lower = s.toLowerCase()
  if (lower.startsWith('<svg') || (lower.startsWith('<?xml') && lower.includes('<svg'))) return 'svg'

  // HTML: doctype / html tag / common block elements
  const isHtml =
    /^<!DOCTYPE\s+html/i.test(s) ||
    /^<html[\s>]/i.test(s) ||
    /<(div|p|span|section|article|header|footer|nav|ul|ol|li|table|form|input|button|a\b|h[1-6]|img|script|style|body)[\s\/>]/i.test(s)
  if (isHtml) return 'html'

  // JSON: first char is { or [ and parses successfully
  if ((s[0] === '{' || s[0] === '[') && isValidJSON(s)) return 'json'

  // CSV: ≥2 lines, consistent comma count ≥1, no HTML/JSON markers
  if (detectCSV(s)) return 'csv'

  // Markdown: count signals
  const mdSignals = [
    /^#{1,6}\s/m.test(s),        // headings
    /\*\*.+?\*\*/.test(s),       // bold
    /^\s*[-*+] /m.test(s),       // unordered list
    /^\s*\d+\. /m.test(s),       // ordered list
    /^> /m.test(s),              // blockquote
    /```/.test(s),               // code fence
    /\[.+?\]\(.+?\)/.test(s),    // link
    /^---+$/m.test(s),           // hr
  ]
  if (mdSignals.filter(Boolean).length >= 1) return 'markdown'

  return 'markdown'
}

function isValidJSON(s: string): boolean {
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

function detectCSV(s: string): boolean {
  // Reject if looks like HTML or JSON
  if (s[0] === '{' || s[0] === '[') return false
  const sl = s.toLowerCase()
  if (sl.includes('<html') || sl.includes('<!doctype')) return false

  const lines = s.split('\n').filter(l => l.trim() !== '')
  if (lines.length < 2) return false

  const commaCount = (lines[0].match(/,/g) || []).length
  if (commaCount < 1) return false

  return lines.every(line => (line.match(/,/g) || []).length === commaCount)
}
