'use client'

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowClockwiseIcon, ArrowRightIcon } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { detectFormat } from '@/lib/detectFormat'
import { StaggerContainer, StaggerItem, FadeIn } from '@/components/ui/MotionWrapper'
import { PostCard } from '@/components/ui/PostCard'
import {
  buildJsxSrcdoc,
  buildHtmlSrcdoc,
  buildSvgSrcdoc,
  buildLottieSrcdoc,
  buildP5Srcdoc,
  buildRevealSrcdoc,
  buildGlslSrcdoc,
  parseCSV,
  formatJSON,
} from '@/components/ContentRenderer'

interface Post {
  id: string
  slug: string
  title?: string
  ai_title?: string
  content: string
  format: string
  policy: string
  views: number
  likes: number
  last_viewed_at?: string
  created_at: string
}

type Policy = 'open' | 'password' | 'ai-review'
type ViewPolicy = 'open' | 'password' | 'human-qa' | 'ai-qa'
type Format = 'auto' | 'markdown' | 'html' | 'jsx' | 'svg' | 'csv' | 'json' | 'lottie' | 'p5' | 'reveal' | 'glsl' | 'image'

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'jsx', label: 'JSX' },
  { value: 'svg', label: 'SVG' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'lottie', label: 'Lottie' },
  { value: 'p5', label: 'P5.js' },
  { value: 'reveal', label: 'Slides' },
  { value: 'glsl', label: 'GLSL' },
  { value: 'image', label: 'Image' },
]

const POLICY_OPTIONS: { value: Policy; label: string; desc: string }[] = [
  { value: 'password', label: 'Password', desc: 'Password to edit' },
  { value: 'open', label: 'Open', desc: 'Anyone can edit' },
  { value: 'ai-review', label: 'AI Review', desc: 'AI reviews edits' },
]

const VIEW_POLICY_OPTIONS: { value: ViewPolicy; label: string; desc: string }[] = [
  { value: 'open', label: 'Open', desc: 'Anyone can view' },
  { value: 'password', label: 'Password', desc: 'Password to view' },
  { value: 'human-qa', label: 'Human QA', desc: 'Answer a question' },
  { value: 'ai-qa', label: 'AI QA', desc: 'AI judges answer' },
]

const POLICY_SUCCESS_MSG: Record<Policy, string> = {
  open: 'Published. Anyone can edit.',
  password: 'Published. Password required to edit.',
  'ai-review': 'Published. AI will review edits.',
}

const MAX_CONTENT_BYTES = Number(process.env.NEXT_PUBLIC_MAX_CONTENT_BYTES) || 5 * 1024 * 1024

const DEFAULT_AI_REVIEW_PROMPT = process.env.NEXT_PUBLIC_DEFAULT_AI_REVIEW_PROMPT ||
  'Accept edits that fix typos, improve clarity, add useful information, or make reasonable updates. Reject spam, vandalism, off-topic, or destructive edits.'

const DEFAULT_AI_QA_PROMPT = process.env.NEXT_PUBLIC_DEFAULT_AI_QA_PROMPT ||
  'Be reasonably lenient — accept answers that are roughly correct, use synonyms, or show clear understanding even if not word-perfect.'

function byteLength(str: string): number {
  return new Blob([str]).size
}

function generatePassword(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function InfoRow({ label, value, variant }: { label: string; value: string; variant?: 'blue' | 'violet' }) {
  const [copied, setCopied] = useState(false)
  const bgClass = variant === 'blue' ? 'bg-blue-50 border-blue-100' : variant === 'violet' ? 'bg-violet-50 border-violet-100' : 'bg-slate-50 border-slate-200'
  const labelClass = variant === 'blue' ? 'text-blue-600' : variant === 'violet' ? 'text-violet-600' : 'text-slate-500'
  const valueClass = variant === 'blue' ? 'text-blue-900' : variant === 'violet' ? 'text-violet-900' : 'text-slate-900'
  return (
    <div className={`${bgClass} border rounded-xl p-3 text-left flex items-center justify-between gap-2`}>
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-medium ${labelClass} mb-0.5`}>{label}</div>
        <code className={`text-sm font-mono ${valueClass} break-all`}>{value}</code>
      </div>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-1"
        title="Copy"
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        )}
      </button>
    </div>
  )
}

function AgentSetupButton() {
  const [open, setOpen] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedConfig, setCopiedConfig] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const prompt = `Read ${origin}/skill.md and follow the instructions to publish content via Sho.`
  const mcpConfig = JSON.stringify({ mcpServers: { sho: { type: "http", url: `${origin}/mcp` } } }, null, 2)

  const copyPrompt = () => { navigator.clipboard.writeText(prompt); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1500) }
  const copyConfig = () => { navigator.clipboard.writeText(mcpConfig); setCopiedConfig(true); setTimeout(() => setCopiedConfig(false), 1500) }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-all"
      >
        <span className="text-[10px] bg-orange-50 text-orange-500 rounded px-1.5 py-0.5 font-medium tracking-wider">Agent</span>
        Connect AI Agent
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
            >
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 text-center mb-1">Connect AI Agent</h2>
                <p className="text-sm text-slate-500 text-center mb-5">Choose how to connect your AI agent to Sho</p>

                {/* Option 1: Prompt */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded px-2 py-0.5">1</span>
                    <span className="text-sm font-medium text-slate-700">Send this prompt to your agent</span>
                  </div>
                  <div
                    onClick={copyPrompt}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-slate-300 hover:bg-slate-100/50 transition-all group"
                  >
                    <code className="text-sm text-slate-700 leading-relaxed block">{prompt}</code>
                    <div className="flex justify-end mt-2">
                      <span className={`text-xs transition-colors ${copiedPrompt ? 'text-emerald-500' : 'text-slate-400 group-hover:text-slate-500'}`}>
                        {copiedPrompt ? 'Copied!' : 'Click to copy'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400">or</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                {/* Option 2: MCP Config */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded px-2 py-0.5">2</span>
                    <span className="text-sm font-medium text-slate-700">Add MCP server config</span>
                  </div>
                  <div
                    onClick={copyConfig}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-slate-300 hover:bg-slate-100/50 transition-all group"
                  >
                    <pre className="text-sm text-slate-700 font-mono leading-relaxed overflow-x-auto">{mcpConfig}</pre>
                    <div className="flex justify-end mt-2">
                      <span className={`text-xs transition-colors ${copiedConfig ? 'text-emerald-500' : 'text-slate-400 group-hover:text-slate-500'}`}>
                        {copiedConfig ? 'Copied!' : 'Click to copy'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Steps */}
                <div className="space-y-1.5 text-sm text-slate-500">
                  <p><span className="font-semibold text-slate-600">1.</span> Copy the prompt or config above</p>
                  <p><span className="font-semibold text-slate-600">2.</span> Paste it in your AI agent (Claude, Cursor, etc.)</p>
                  <p><span className="font-semibold text-slate-600">3.</span> Start publishing with <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">sho_publish</code></p>
                </div>
              </div>

              <div className="border-t border-slate-100 px-6 py-3 flex justify-end">
                <button
                  onClick={() => setOpen(false)}
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors px-3 py-1.5"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function CopyAllButton({ title, link, editPassword, viewPassword }: { title?: string; link: string; editPassword?: string; viewPassword?: string }) {
  const [copied, setCopied] = useState(false)
  const copyAll = () => {
    const lines: string[] = []
    if (title) lines.push(`Title: ${title}`)
    lines.push(`Link: ${link}`)
    if (editPassword) lines.push(`Edit Password: ${editPassword}`)
    if (viewPassword) lines.push(`View Password: ${viewPassword}`)
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copyAll}
      className="w-full border border-slate-200 rounded-xl py-2 text-sm text-slate-500 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5"
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          <span className="text-emerald-600">Copied!</span>
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy All
        </>
      )}
    </button>
  )
}

interface PublishResult {
  slug: string
  edit_token: string
  edit_password?: string
  view_password?: string
}

const IFRAME_FORMATS = ['html', 'jsx', 'svg', 'lottie', 'p5', 'reveal', 'glsl'] as const
type IframeFormat = typeof IFRAME_FORMATS[number]

function InlinePreview({ content, format }: { content: string; format: string }) {
  const [renderError, setRenderError] = React.useState<string | null>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  // Reset error when content changes
  React.useEffect(() => {
    setRenderError(null)
  }, [content])

  // Listen for error messages from iframe
  React.useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'sho-render-error' && e.source === iframeRef.current?.contentWindow) {
        setRenderError(String(e.data.message || 'Unknown error'))
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const errorPanel = renderError && (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 rounded-xl">
      <div className="max-w-[400px] w-[90%] bg-[#1a1a2e] rounded-2xl p-6 text-center border border-white/[0.08] shadow-xl">
        <div className="text-3xl mb-3">&#9888;</div>
        <div className="text-sm font-semibold text-red-400 mb-2">Render Error</div>
        <pre className="bg-[#0d1117] text-[#e6edf3] p-3 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-left max-h-[150px] overflow-auto mb-3">
          {renderError}
        </pre>
        <span className="inline-block text-[10px] font-medium text-white/40 bg-white/[0.06] rounded px-2 py-0.5 uppercase tracking-wider">
          {format}
        </span>
      </div>
    </div>
  )

  // Image format
  if (format === 'image') {
    return (
      <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 min-h-[400px] max-h-[500px] flex items-center justify-center p-4">
        <img
          src={content}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '460px', objectFit: 'contain' }}
          onError={() => setRenderError('Failed to load image')}
        />
        {errorPanel}
      </div>
    )
  }

  // iframe-based formats
  if ((IFRAME_FORMATS as readonly string[]).includes(format)) {
    let srcdoc: string
    switch (format as IframeFormat) {
      case 'jsx':    srcdoc = buildJsxSrcdoc(content); break
      case 'svg':    srcdoc = buildSvgSrcdoc(content); break
      case 'lottie': srcdoc = buildLottieSrcdoc(content); break
      case 'p5':     srcdoc = buildP5Srcdoc(content); break
      case 'reveal': srcdoc = buildRevealSrcdoc(content); break
      case 'glsl':   srcdoc = buildGlslSrcdoc(content); break
      default:       srcdoc = buildHtmlSrcdoc(content)
    }
    return (
      <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-white min-h-[400px]">
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          className="w-full h-[500px] border-none"
        />
        {errorPanel}
      </div>
    )
  }

  // CSV — table view
  if (format === 'csv') {
    const rows = parseCSV(content)
    const [head, ...body] = rows
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white min-h-[400px]">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {head.map((h, i) => (
                  <th key={i} className="px-3 py-2 bg-slate-50 border-b-2 border-slate-200 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-1.5 border-b border-slate-100 text-xs text-slate-700">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // JSON — formatted code
  if (format === 'json') {
    const { formatted, error } = formatJSON(content)
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-[#0d1117] min-h-[400px]">
        {error && (
          <div className="px-3 py-1.5 bg-[#3d1a1a] text-red-400 text-xs font-mono">
            Parse error: {error}
          </div>
        )}
        <pre className="p-4 text-xs font-mono text-[#e6edf3] leading-relaxed whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto">
          {formatted}
        </pre>
      </div>
    )
  }

  // Markdown / txt / fallback
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white min-h-[400px] max-h-[500px] overflow-y-auto">
      <div className="prose prose-sm prose-gray max-w-none p-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}

export default function HomeClient({ posts }: { posts: Post[] }) {
  const router = useRouter()

  // Author
  const [author, setAuthor] = useState('')
  useEffect(() => {
    const saved = localStorage.getItem('sho:author')
    if (saved) {
      setAuthor(saved)
    } else {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/authors/random`)
        .then(r => r.json())
        .then(data => {
          if (data.author) {
            setAuthor(data.author)
            localStorage.setItem('sho:author', data.author)
          }
        })
        .catch(() => {})
    }
  }, [])

  function updateAuthor(value: string) {
    setAuthor(value)
    localStorage.setItem('sho:author', value)
  }

  async function refreshAuthor() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/authors/random`)
      const data = await res.json()
      if (data.author) {
        setAuthor(data.author)
        localStorage.setItem('sho:author', data.author)
      }
    } catch {}
  }

  // Content
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [overLimit, setOverLimit] = useState(false)

  // Publish options
  const [format, setFormat] = useState<Format>('auto')
  const [pol, setPol] = useState<Policy>('password')
  const [editPassword, setEditPassword] = useState(() => generatePassword())
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_REVIEW_PROMPT)
  const [viewPol, setViewPol] = useState<ViewPolicy>('open')
  const [viewPassword, setViewPassword] = useState(() => generatePassword())
  const [viewQuestion, setViewQuestion] = useState('')
  const [viewQAPrompt, setViewQAPrompt] = useState(DEFAULT_AI_QA_PROMPT)
  const [viewAnswer, setViewAnswer] = useState('')
  const [unlisted, setUnlisted] = useState(false)

  // Publish state
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [duplicate, setDuplicate] = useState<string | null>(null)
  const [error, setError] = useState('')

  const hasContent = content.trim().length > 0
  const detectedFormat = useMemo(() => detectFormat(content), [content])

  function updateContent(text: string) {
    if (byteLength(text) > MAX_CONTENT_BYTES) {
      setOverLimit(true)
      return
    }
    setOverLimit(false)
    setContent(text)
  }

  async function loadFile(file: File) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          updateContent(reader.result)
          setFormat('image')
        }
      }
      reader.readAsDataURL(file)
    } else {
      const text = await file.text()
      updateContent(text)
    }
  }

  const refreshEditPassword = useCallback(() => setEditPassword(generatePassword()), [])
  const refreshViewPassword = useCallback(() => setViewPassword(generatePassword()), [])

  function handlePreview() {
    sessionStorage.setItem('preview_content', content)
    sessionStorage.setItem('preview_format', format)
    router.push('/preview')
  }

  async function handleSubmit() {
    if (!content.trim() || !author.trim() || overLimit) return
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = {
      content,
      format,
      policy: pol,
      view_policy: viewPol,
      unlisted,
      author: author.trim(),
    }
    if (title.trim()) body.title = title.trim()
    if (pol === 'password') body.password = editPassword
    if (pol === 'ai-review' && aiPrompt) body.ai_review_prompt = aiPrompt
    if (viewPol === 'password') body.view_password = viewPassword
    if (viewPol === 'human-qa' || viewPol === 'ai-qa') {
      if (viewQuestion) body.view_qa_question = viewQuestion
    }
    if (viewPol === 'ai-qa' && viewQAPrompt) body.view_qa_prompt = viewQAPrompt
    if (viewPol === 'human-qa' && viewAnswer) body.view_qa_answer = viewAnswer

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/posts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (res.status === 409 && data.slug) {
        setDuplicate(data.slug)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to publish')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, overLimit, format, pol, editPassword, aiPrompt, viewPol, viewPassword, viewQuestion, viewQAPrompt, viewAnswer, unlisted, title, author]
  )

  function resetForm() {
    setContent('')
    setTitle('')
    setFormat('auto')
    setPol('password')
    setEditPassword(generatePassword())
    setAiPrompt(DEFAULT_AI_REVIEW_PROMPT)
    setViewPol('open')
    setViewPassword(generatePassword())
    setViewQuestion('')
    setViewQAPrompt(DEFAULT_AI_QA_PROMPT)
    setViewAnswer('')
    setUnlisted(false)
    setResult(null)
    setDuplicate(null)
    setError('')
  }

  // --- Success View ---
  if (result) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="w-full max-w-md text-center"
        >
          <div className="border border-slate-200 rounded-2xl p-8 bg-white shadow-sm">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Published</h1>
            <p className="text-sm text-slate-500 mb-4">
              {POLICY_SUCCESS_MSG[pol]}
            </p>

            <div className="space-y-2.5 mb-4">
              {title.trim() && (
                <InfoRow label="Title" value={title.trim()} />
              )}
              <InfoRow label="Link" value={`${typeof window !== 'undefined' ? window.location.origin : ''}/${result.slug}`} />
              {result.edit_password && (
                <InfoRow label="Edit Password" value={result.edit_password} variant="blue" />
              )}
              {result.view_password && (
                <InfoRow label="View Password" value={result.view_password} variant="violet" />
              )}
            </div>

            {viewPol !== 'open' && !result.view_password && (
              <p className="text-xs text-slate-400 mb-3">
                View policy: {VIEW_POLICY_OPTIONS.find(o => o.value === viewPol)?.label}
              </p>
            )}

            <CopyAllButton
              title={title.trim()}
              link={`${typeof window !== 'undefined' ? window.location.origin : ''}/${result.slug}`}
              editPassword={result.edit_password}
              viewPassword={result.view_password}
            />

            <div className="flex gap-3 justify-center mt-3">
              <Link
                href={`/${result.slug}`}
                className="bg-slate-800 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-slate-900 transition-colors"
              >
                View Post
              </Link>
            </div>
          </div>

          <button
            onClick={resetForm}
            className="inline-flex items-center gap-1.5 mt-6 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Create another <ArrowRightIcon size={14} />
          </button>
        </motion.div>
      </main>
    )
  }

  // --- Duplicate View ---
  if (duplicate) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="w-full max-w-md text-center"
        >
          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-8">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Already published</h1>
            <p className="text-sm text-slate-500 mb-6">
              This content has already been published.
            </p>
            <Link
              href={`/${duplicate}`}
              className="inline-block bg-slate-800 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-slate-900 transition-colors"
            >
              View existing post
            </Link>
          </div>
          <button
            onClick={resetForm}
            className="inline-flex items-center gap-1.5 mt-6 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Create another <ArrowRightIcon size={14} />
          </button>
        </motion.div>
      </main>
    )
  }

  // --- Main View ---
  return (
    <main className="min-h-[100dvh] bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeIn className="flex items-center justify-between py-6">
          <a
            href="https://splaz.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/logo.png"
              alt="Sho"
              width={28}
              height={28}
              className="rounded-lg"
              priority
            />
            <span className="text-lg font-semibold tracking-tight text-slate-900">Sho</span>
          </a>
          <a
            href="https://github.com/atompilot/sho"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
        </FadeIn>

        {/* Main Grid: 3fr 2fr */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-12 lg:gap-16 pt-8 lg:pt-16 pb-16">

          {/* Left: Publish Area */}
          <div>
            <FadeIn delay={0.05}>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tighter leading-[1.1]">
                  Publish anything.
                </h1>
                <Link
                  href="/feeds"
                  className="group flex items-center gap-1.5 shrink-0 mt-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-sm hover:shadow-md"
                >
                  Discover
                  <ArrowRightIcon size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <p className="text-lg text-slate-400 mt-3 mb-10">
                One API call. Any format.
              </p>
            </FadeIn>

            {/* Author input */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                hasContent ? 'max-h-16 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'
              }`}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Author"
                  value={author}
                  onChange={(e) => updateAuthor(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-xl px-5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 hover:border-slate-300 transition-all placeholder:text-slate-300"
                />
                <button
                  type="button"
                  onClick={refreshAuthor}
                  className="border border-slate-200 rounded-xl px-3 py-3 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
                  title="Generate new author name"
                >
                  <ArrowClockwiseIcon size={16} />
                </button>
              </div>
            </div>

            {/* Title input */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                hasContent ? 'max-h-16 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'
              }`}
            >
              <input
                type="text"
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 hover:border-slate-300 transition-all placeholder:text-slate-300"
              />
            </div>

            {/* Content Input */}
            <FadeIn delay={0.1}>
              <div
                className={`transition-all ${isDragOver ? 'ring-2 ring-orange-300 rounded-xl' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file) loadFile(file)
                }}
              >
                <textarea
                  placeholder="What would you like to share?"
                  value={content}
                  onChange={(e) => updateContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={(e) => {
                    const file = e.clipboardData.files[0]
                    if (file) {
                      e.preventDefault()
                      loadFile(file)
                    }
                  }}
                  rows={hasContent ? 12 : 6}
                  className="w-full border border-slate-200 rounded-xl px-5 py-4 text-base font-mono resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 hover:border-slate-300 transition-all placeholder:text-slate-300 leading-relaxed"
                  autoFocus
                />

                {overLimit && (
                  <p className="text-xs text-red-500 mt-2">Content exceeds {MAX_CONTENT_BYTES / (1024 * 1024)} MB limit.</p>
                )}

                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    hasContent ? 'max-h-8 opacity-100 mt-1.5' : 'max-h-0 opacity-0 mt-0'
                  }`}
                >
                  <div className="flex justify-end">
                    <span className="text-xs text-slate-400">
                      {content.length.toLocaleString()} chars
                    </span>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Publish Options */}
            <AnimatePresence>
              {hasContent && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-6 pt-6">

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-100" />
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">Publish Options</span>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>

                    {/* Format */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2.5">Format</label>
                      <div className="flex flex-wrap gap-1.5">
                        {FORMAT_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFormat(opt.value)}
                            className={`px-3.5 py-1.5 rounded-full text-sm transition-all duration-200 ${
                              format === opt.value
                                ? 'bg-slate-800 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {opt.value === 'auto' ? `Auto: ${detectedFormat}` : opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Edit Policy */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2.5">Edit Policy</label>
                      <div className="grid grid-cols-2 gap-2">
                        {POLICY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPol(opt.value)}
                            className={`text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                              pol === opt.value
                                ? 'border-slate-800 bg-slate-50'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                          </button>
                        ))}
                      </div>

                      {/* Edit password */}
                      <div className={`overflow-hidden transition-all duration-300 ease-out ${
                        pol === 'password' ? 'max-h-16 opacity-100 mt-2.5' : 'max-h-0 opacity-0 mt-0'
                      }`}>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="6-digit password"
                            maxLength={6}
                            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={refreshEditPassword}
                            className="border border-slate-200 rounded-xl px-3 py-2.5 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
                            title="Regenerate password"
                          >
                            <ArrowClockwiseIcon size={14} />
                          </button>
                        </div>
                      </div>

                      {/* AI prompt */}
                      <div className={`overflow-hidden transition-all duration-300 ease-out ${
                        pol === 'ai-review' ? 'max-h-32 opacity-100 mt-2.5' : 'max-h-0 opacity-0 mt-0'
                      }`}>
                        <textarea
                          placeholder="Describe what edits should be accepted..."
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          rows={3}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                      </div>
                    </div>

                    {/* View Policy */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2.5">View Policy</label>
                      <div className="grid grid-cols-2 gap-2">
                        {VIEW_POLICY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setViewPol(opt.value)}
                            className={`text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                              viewPol === opt.value
                                ? 'border-slate-800 bg-slate-50'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                          </button>
                        ))}
                      </div>

                      {/* View password */}
                      <div className={`overflow-hidden transition-all duration-300 ease-out ${
                        viewPol === 'password' ? 'max-h-16 opacity-100 mt-2.5' : 'max-h-0 opacity-0 mt-0'
                      }`}>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={viewPassword}
                            onChange={(e) => setViewPassword(e.target.value)}
                            placeholder="6-digit password"
                            maxLength={6}
                            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={refreshViewPassword}
                            className="border border-slate-200 rounded-xl px-3 py-2.5 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
                            title="Regenerate password"
                          >
                            <ArrowClockwiseIcon size={14} />
                          </button>
                        </div>
                      </div>

                      {/* QA fields */}
                      <div className={`overflow-hidden transition-all duration-300 ease-out ${
                        (viewPol === 'human-qa' || viewPol === 'ai-qa') ? 'max-h-64 opacity-100 mt-2.5' : 'max-h-0 opacity-0 mt-0'
                      }`}>
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Question viewers must answer"
                            value={viewQuestion}
                            onChange={(e) => setViewQuestion(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          />
                          {viewPol === 'human-qa' && (
                            <input
                              type="text"
                              placeholder="Expected answer (exact match, case-insensitive)"
                              value={viewAnswer}
                              onChange={(e) => setViewAnswer(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                          )}
                          {viewPol === 'ai-qa' && (
                            <textarea
                              placeholder="AI judgment instructions (how should AI evaluate the answer?)"
                              value={viewQAPrompt}
                              onChange={(e) => setViewQAPrompt(e.target.value)}
                              rows={2}
                              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Unlisted toggle */}
                    <div className="flex items-center justify-between py-3 px-4 border border-slate-200 rounded-xl">
                      <div>
                        <div className="text-sm font-medium text-slate-700">Unlisted</div>
                        <div className="text-xs text-slate-500 mt-0.5">Only accessible via direct link</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={unlisted}
                        onClick={() => setUnlisted(!unlisted)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          unlisted ? 'bg-slate-800' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            unlisted ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Error */}
                    {error && (
                      <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">
                        {hasContent ? 'Cmd + Return to publish' : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!hasContent || overLimit}
                          onClick={handlePreview}
                          className="border border-slate-200 text-slate-600 rounded-xl px-5 py-2.5 text-sm disabled:opacity-30 hover:border-slate-300 hover:text-slate-800 transition-all duration-200"
                        >
                          Preview
                        </button>
                        <motion.button
                          type="button"
                          disabled={loading || !hasContent || !author.trim() || overLimit}
                          onClick={handleSubmit}
                          whileTap={{ scale: 0.98 }}
                          className="bg-slate-800 text-white rounded-xl px-6 py-2.5 text-sm font-medium disabled:opacity-30 hover:bg-slate-900 hover:shadow-lg hover:shadow-slate-300/30 transition-all duration-200"
                        >
                          {loading ? 'Publishing...' : 'Publish'}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Trending / Preview */}
          <div className="lg:pt-2">
            {/* Header: Trending ↔ Preview */}
            <div className="flex items-center justify-between mb-5">
              <AnimatePresence mode="wait">
                {hasContent ? (
                  <motion.span
                    key="preview"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="text-[11px] font-medium text-orange-500 uppercase tracking-widest"
                  >
                    Preview
                    <span className="ml-2 text-slate-300 normal-case tracking-normal">
                      {format === 'auto' ? detectedFormat : format}
                    </span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="trending"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="text-[11px] font-medium text-slate-400 uppercase tracking-widest"
                  >
                    Trending
                  </motion.span>
                )}
              </AnimatePresence>
              {!hasContent && (
                <Link
                  href="/explore"
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Explore <ArrowRightIcon size={12} />
                </Link>
              )}
            </div>

            {/* Body: Conditional rendering */}
            <AnimatePresence mode="wait">
              {hasContent ? (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <InlinePreview
                    content={content}
                    format={format === 'auto' ? detectedFormat : format}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="trending"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {posts.length > 0 ? (
                    <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                      {posts.slice(0, 6).map((post) => (
                        <StaggerItem key={post.id}>
                          <PostCard
                            slug={post.slug}
                            title={post.title}
                            aiTitle={post.ai_title}
                            format={post.format}
                            views={post.views}
                            likes={post.likes}
                            lastViewedAt={post.last_viewed_at}
                            createdAt={post.created_at}
                          />
                        </StaggerItem>
                      ))}
                    </StaggerContainer>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-slate-400">No posts yet. Be the first to publish.</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI hint: only when not previewing */}
            {!hasContent && (
              <div className="mt-8 flex flex-wrap gap-2">
                <a
                  href="/skill.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-all"
                >
                  <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 font-medium uppercase tracking-wider">AI</span>
                  skill.md
                </a>
                <AgentSetupButton />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="py-8 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            &copy; 2026 Sho by Splat AI INC.
          </p>
          <a
            href="https://splaz.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-900 transition-colors"
          >
            splaz.app
          </a>
        </footer>
      </div>
    </main>
  )
}
