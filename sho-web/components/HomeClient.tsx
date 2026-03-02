'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { detectFormat } from '@/lib/detectFormat'

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

type Policy = 'locked' | 'open' | 'password' | 'ai-review'
type ViewPolicy = 'open' | 'password' | 'human-qa' | 'ai-qa'
type Format = 'auto' | 'markdown' | 'html' | 'jsx' | 'svg' | 'csv' | 'json' | 'lottie' | 'p5' | 'reveal' | 'glsl'

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
]

const POLICY_OPTIONS: { value: Policy; label: string; desc: string }[] = [
  { value: 'locked', label: 'Locked', desc: 'No edits allowed' },
  { value: 'open', label: 'Open', desc: 'Anyone can edit' },
  { value: 'password', label: 'Password', desc: 'Password to edit' },
  { value: 'ai-review', label: 'AI Review', desc: 'AI reviews edits' },
]

const VIEW_POLICY_OPTIONS: { value: ViewPolicy; label: string; desc: string }[] = [
  { value: 'open', label: 'Open', desc: 'Anyone can view' },
  { value: 'password', label: 'Password', desc: 'Password to view' },
  { value: 'human-qa', label: 'Human QA', desc: 'Answer a question' },
  { value: 'ai-qa', label: 'AI QA', desc: 'AI judges answer' },
]

const POLICY_SUCCESS_MSG: Record<Policy, string> = {
  locked: 'Published and locked. No further edits.',
  open: 'Published. Anyone can edit.',
  password: 'Published. Password required to edit.',
  'ai-review': 'Published. AI will review edits.',
}

const MAX_CONTENT_BYTES = Number(process.env.NEXT_PUBLIC_MAX_CONTENT_BYTES) || 5 * 1024 * 1024

const DEFAULT_AI_REVIEW_PROMPT = process.env.NEXT_PUBLIC_DEFAULT_AI_REVIEW_PROMPT ||
  'Accept edits that fix typos, improve clarity, add useful information, or make reasonable updates. Reject spam, vandalism, off-topic, or destructive edits.'

function byteLength(str: string): number {
  return new Blob([str]).size
}

function generatePassword(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

interface PublishResult {
  slug: string
  edit_token: string
  edit_password?: string
  view_password?: string
}

export default function HomeClient({ posts }: { posts: Post[] }) {
  const router = useRouter()

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
    const text = await file.text()
    updateContent(text)
  }

  const refreshEditPassword = useCallback(() => setEditPassword(generatePassword()), [])
  const refreshViewPassword = useCallback(() => setViewPassword(generatePassword()), [])

  function handlePreview() {
    sessionStorage.setItem('preview_content', content)
    sessionStorage.setItem('preview_format', format)
    router.push('/preview')
  }

  async function handleSubmit() {
    if (!content.trim() || overLimit) return
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = {
      content,
      format,
      policy: pol,
      view_policy: viewPol,
      unlisted,
    }
    if (title.trim()) body.title = title.trim()
    if (pol === 'password') body.password = editPassword
    if (pol === 'ai-review' && aiPrompt) body.ai_review_prompt = aiPrompt
    if (viewPol === 'password') body.view_password = viewPassword
    if (viewPol === 'human-qa' || viewPol === 'ai-qa') {
      if (viewQuestion) body.view_qa_question = viewQuestion
    }
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
    [content, overLimit, format, pol, editPassword, aiPrompt, viewPol, viewPassword, viewQuestion, viewAnswer, unlisted, title]
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
    setViewAnswer('')
    setUnlisted(false)
    setResult(null)
    setDuplicate(null)
    setError('')
  }

  // --- Success View ---
  if (result) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
        <div className="w-full max-w-md text-center animate-fade-up">
          <div className="border border-gray-200 rounded-2xl p-8">
            <div className="text-4xl mb-4">&#x2713;</div>
            <h1 className="text-xl font-semibold mb-2">Published</h1>
            <p className="text-sm text-gray-500 mb-4">
              {POLICY_SUCCESS_MSG[pol]}
            </p>

            {result.edit_password && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-left">
                <div className="text-xs font-medium text-blue-700 mb-1">Edit Password</div>
                <code className="text-lg font-mono text-blue-900 tracking-widest">{result.edit_password}</code>
              </div>
            )}

            {result.view_password && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3 text-left">
                <div className="text-xs font-medium text-purple-700 mb-1">View Password</div>
                <code className="text-lg font-mono text-purple-900 tracking-widest">{result.view_password}</code>
              </div>
            )}

            {viewPol !== 'open' && !result.view_password && (
              <p className="text-xs text-gray-400 mb-3">
                View policy: {VIEW_POLICY_OPTIONS.find(o => o.value === viewPol)?.label}
              </p>
            )}

            <div className="flex gap-3 justify-center mt-4">
              <Link
                href={`/${result.slug}`}
                className="bg-[#1E293B] text-white rounded-xl px-5 py-2.5 text-sm hover:bg-[#0F172A] transition-colors"
              >
                View Post
              </Link>
            </div>
          </div>

          <button
            onClick={resetForm}
            className="inline-block mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Create another &rarr;
          </button>
        </div>
      </main>
    )
  }

  // --- Duplicate View ---
  if (duplicate) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
        <div className="w-full max-w-md text-center animate-fade-up">
          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-8">
            <div className="text-4xl mb-4">&#x26A0;</div>
            <h1 className="text-xl font-semibold mb-2">Already published</h1>
            <p className="text-sm text-gray-500 mb-6">
              This content has already been published. Here&apos;s the existing post.
            </p>
            <Link
              href={`/${duplicate}`}
              className="inline-block bg-[#1E293B] text-white rounded-xl px-5 py-2.5 text-sm hover:bg-[#0F172A] transition-colors"
            >
              View existing post &rarr;
            </Link>
          </div>
          <button
            onClick={resetForm}
            className="inline-block mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Create another &rarr;
          </button>
        </div>
      </main>
    )
  }

  // --- Main View ---
  return (
    <main className="min-h-screen flex flex-col items-center px-6 bg-white">

      {/* Hero */}
      <div className="flex flex-col items-center w-full max-w-lg pt-28 pb-12">

        {/* Brand mark */}
        <a
          href="https://splaz.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 mb-5 animate-fade-up hover:opacity-80 transition-opacity"
        >
          <Image
            src="/logo.png"
            alt="Sho"
            width={32}
            height={32}
            className="rounded-lg"
            priority
          />
          <span className="text-xl font-semibold tracking-tight text-gray-900">Sho</span>
        </a>

        {/* Slogan */}
        <h1
          className="text-5xl font-black text-[#111827] tracking-tight text-center mb-2 animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
          Publish anything.
        </h1>
        <p
          className="text-lg font-medium text-[#F97316] mb-10 text-center animate-fade-up"
          style={{ animationDelay: '0.2s' }}
        >
          No login required.
        </p>

        {/* Title input — slides in when content exists */}
        <div
          className={`w-full overflow-hidden transition-all duration-300 ease-out ${
            hasContent ? 'max-h-16 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'
          }`}
        >
          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-200 rounded-2xl px-5 py-3 text-base focus:outline-none focus:ring-[3px] focus:ring-[#1E293B]/[0.08] focus:border-[#1E293B] hover:border-[#64748B] transition-all placeholder:text-gray-300"
          />
        </div>

        {/* Content Input */}
        <div
          className={`w-full transition-all animate-fade-up ${isDragOver ? 'ring-2 ring-blue-300 rounded-2xl' : ''}`}
          style={{ animationDelay: '0.3s' }}
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
            rows={hasContent ? 10 : 6}
            className="w-full border border-gray-200 rounded-2xl px-5 py-4 text-base font-mono resize-none focus:outline-none focus:ring-[3px] focus:ring-[#1E293B]/[0.08] focus:border-[#1E293B] hover:border-[#64748B] transition-all placeholder:text-gray-300 leading-relaxed"
            autoFocus
          />

          {overLimit && (
            <p className="text-xs text-red-500 mt-2">Content exceeds {MAX_CONTENT_BYTES / (1024 * 1024)} MB limit.</p>
          )}

          {/* Char count — slides in */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              hasContent ? 'max-h-8 opacity-100 mt-1.5' : 'max-h-0 opacity-0 mt-0'
            }`}
          >
            <div className="flex justify-end">
              <span className="text-xs text-gray-400">
                {content.length.toLocaleString()} chars
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Publish Options — slides in when content exists ── */}
      <div
        className={`w-full max-w-lg overflow-hidden transition-all duration-500 ease-out ${
          hasContent ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-6 pb-8">

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Publish Options</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2.5">Format</label>
            <div className="flex flex-wrap gap-1.5">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormat(opt.value)}
                  className={`px-3.5 py-1.5 rounded-full text-sm transition-all duration-200 ${
                    format === opt.value
                      ? 'bg-[#1E293B] text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.value === 'auto' ? `Auto: ${detectedFormat}` : opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Edit Policy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2.5">Edit Policy</label>
            <div className="grid grid-cols-2 gap-2">
              {POLICY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPol(opt.value)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                    pol === opt.value
                      ? 'border-[#1E293B] bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
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
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1E293B]/10 focus:border-[#1E293B] transition-all"
                />
                <button
                  type="button"
                  onClick={refreshEditPassword}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all"
                  title="Regenerate password"
                >
                  <RefreshIcon />
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
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1E293B]/10 focus:border-[#1E293B] transition-all"
              />
            </div>
          </div>

          {/* View Policy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2.5">View Policy</label>
            <div className="grid grid-cols-2 gap-2">
              {VIEW_POLICY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setViewPol(opt.value)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                    viewPol === opt.value
                      ? 'border-[#1E293B] bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
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
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1E293B]/10 focus:border-[#1E293B] transition-all"
                />
                <button
                  type="button"
                  onClick={refreshViewPassword}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all"
                  title="Regenerate password"
                >
                  <RefreshIcon />
                </button>
              </div>
            </div>

            {/* QA fields */}
            <div className={`overflow-hidden transition-all duration-300 ease-out ${
              (viewPol === 'human-qa' || viewPol === 'ai-qa') ? 'max-h-32 opacity-100 mt-2.5' : 'max-h-0 opacity-0 mt-0'
            }`}>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Question viewers must answer"
                  value={viewQuestion}
                  onChange={(e) => setViewQuestion(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E293B]/10 focus:border-[#1E293B] transition-all"
                />
                {viewPol === 'human-qa' && (
                  <input
                    type="text"
                    placeholder="Expected answer (exact match, case-insensitive)"
                    value={viewAnswer}
                    onChange={(e) => setViewAnswer(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E293B]/10 focus:border-[#1E293B] transition-all"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Unlisted toggle */}
          <div className="flex items-center justify-between py-3 px-4 border border-gray-200 rounded-xl">
            <div>
              <div className="text-sm font-medium text-gray-700">Unlisted</div>
              <div className="text-xs text-gray-500 mt-0.5">Only accessible via direct link</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={unlisted}
              onClick={() => setUnlisted(!unlisted)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                unlisted ? 'bg-[#1E293B]' : 'bg-gray-200'
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
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5 animate-fade-up">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">
              {hasContent ? '⌘ Return to publish' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!hasContent || overLimit}
                onClick={handlePreview}
                className="border border-gray-200 text-gray-600 rounded-xl px-5 py-2.5 text-sm disabled:opacity-30 hover:border-gray-300 hover:text-gray-800 transition-all duration-200"
              >
                Preview
              </button>
              <button
                type="button"
                disabled={loading || !hasContent || overLimit}
                onClick={handleSubmit}
                className="bg-[#1E293B] text-white rounded-xl px-6 py-2.5 text-sm font-medium disabled:opacity-30 hover:bg-[#0F172A] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)] active:translate-y-0 active:shadow-none transition-all duration-200"
              >
                {loading ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Trending — fades out when content exists ── */}
      <div
        className={`w-full max-w-2xl transition-all duration-500 ease-out ${
          hasContent ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[500px] opacity-100 pb-20'
        }`}
      >
        {posts.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-5">
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">
                Trending
              </span>
              <Link
                href="/explore"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Explore &rarr;
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {posts.slice(0, 9).map((post, i) => (
                <Link
                  key={post.id}
                  href={`/${post.slug}`}
                  className="inline-block bg-gray-100 border border-transparent hover:border-[#F97316] hover:text-[#F97316] hover:bg-white text-gray-700 text-sm rounded-2xl px-4 py-2 transition-all duration-200 max-w-[240px] truncate animate-fade-up"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  {post.ai_title || post.title || `/${post.slug}`}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* AI hint */}
      <div className="w-full max-w-2xl text-center pb-8">
        <a
          href="/skill.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-gray-500 transition-colors"
        >
          <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5 font-medium uppercase tracking-wider">AI</span>
          Agents can publish via API & MCP
        </a>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-2xl py-8 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          &copy; 2026 Sho by Splat AI INC.
        </p>
        <a
          href="https://splaz.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
        >
          splaz.app &rarr;
        </a>
      </footer>

    </main>
  )
}
