export type DetectableFormat = 'markdown' | 'html' | 'txt' | 'jsx'

/**
 * Detect content format from its text.
 * Order: JSX → HTML → Markdown → Text
 */
export function detectFormat(content: string): DetectableFormat {
  const s = content.trim()
  if (!s) return 'markdown'

  // JSX: import/export statements or capital-letter component tags
  const isJsx =
    /^(import\s|export\s+(default\s+)?(function|class|const|let|var))/m.test(s) ||
    /\bReact\b/.test(s) ||
    /<[A-Z][A-Za-z]*[\s/>]/.test(s)
  if (isJsx) return 'jsx'

  // HTML: doctype / html tag / common block elements
  const isHtml =
    /^<!DOCTYPE\s+html/i.test(s) ||
    /^<html[\s>]/i.test(s) ||
    /<(div|p|span|section|article|header|footer|nav|ul|ol|li|table|form|input|button|a\b|h[1-6]|img|script|style|body)[\s\/>]/i.test(s)
  if (isHtml) return 'html'

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

  return 'txt'
}
