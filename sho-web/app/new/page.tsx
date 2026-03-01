'use client'

import { useState, Suspense, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { detectFormat } from '@/lib/detectFormat'

type Policy = 'locked' | 'open' | 'password' | 'ai-review'
type ViewPolicy = 'open' | 'password' | 'human-qa' | 'ai-qa'
type Format = 'auto' | 'markdown' | 'html' | 'jsx' | 'svg' | 'csv' | 'json' | 'lottie' | 'p5' | 'reveal' | 'glsl'

const FORMAT_BASE_OPTIONS: { value: Format; label: string }[] = [
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
  { value: 'locked', label: 'Locked', desc: 'No edits allowed after publishing' },
  { value: 'open', label: 'Open', desc: 'Anyone can edit' },
  { value: 'password', label: 'Password', desc: 'Require password to edit' },
  { value: 'ai-review', label: 'AI Review', desc: 'AI reviews edits before applying' },
]

const VIEW_POLICY_OPTIONS: { value: ViewPolicy; label: string; desc: string }[] = [
  { value: 'open', label: 'Open', desc: 'Anyone can view' },
  { value: 'password', label: 'Password', desc: 'Require password to view' },
  { value: 'human-qa', label: 'Human QA', desc: 'Answer a question to view' },
  { value: 'ai-qa', label: 'AI QA', desc: 'AI judges your answer' },
]

const POLICY_SUCCESS_MSG: Record<Policy, string> = {
  locked: 'Published and locked. No further edits.',
  open: 'Published. Anyone can edit.',
  password: 'Published. Password required to edit.',
  'ai-review': 'Published. AI will review edits.',
}

function generatePassword(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function DuplicateView({ slug }: { slug: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-8">
          <div className="text-4xl mb-4">⚠</div>
          <h1 className="text-xl font-semibold mb-2">Already published</h1>
          <p className="text-sm text-gray-500 mb-6">
            This content has already been published. Here&apos;s the existing post.
          </p>
          <Link
            href={`/${slug}`}
            className="inline-block bg-black text-white rounded-lg px-5 py-2.5 text-sm hover:bg-gray-800 transition-colors"
          >
            View existing post →
          </Link>
        </div>
        <Link
          href="/new"
          className="inline-block mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Create another &rarr;
        </Link>
      </div>
    </main>
  )
}

interface PublishResult {
  slug: string
  edit_token: string
  edit_password?: string
  view_password?: string
}

function SuccessView({ result, policy, viewPolicy }: {
  result: PublishResult
  policy: Policy
  viewPolicy: ViewPolicy
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="border border-gray-200 rounded-xl p-8">
          <div className="text-4xl mb-4">&#x2713;</div>
          <h1 className="text-xl font-semibold mb-2">Published</h1>
          <p className="text-sm text-gray-500 mb-4">
            {POLICY_SUCCESS_MSG[policy]}
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

          {viewPolicy !== 'open' && !result.view_password && (
            <p className="text-xs text-gray-400 mb-3">
              View policy: {VIEW_POLICY_OPTIONS.find(o => o.value === viewPolicy)?.label}
            </p>
          )}

          <div className="flex gap-3 justify-center mt-4">
            <Link
              href={`/${result.slug}`}
              className="bg-black text-white rounded-lg px-5 py-2.5 text-sm hover:bg-gray-800 transition-colors"
            >
              View Post
            </Link>
          </div>
        </div>

        <Link
          href="/new"
          className="inline-block mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Create another &rarr;
        </Link>
      </div>
    </main>
  )
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

function NewPostForm() {
  const searchParams = useSearchParams()
  const initialContent = searchParams.get('content') || ''
  const [content, setContent] = useState(initialContent)
  const [format, setFormat] = useState<Format>('auto')
  const [pol, setPol] = useState<Policy>('locked')
  const [editPassword, setEditPassword] = useState(() => generatePassword())
  const [aiPrompt, setAiPrompt] = useState('')
  const [viewPol, setViewPol] = useState<ViewPolicy>('open')
  const [viewPassword, setViewPassword] = useState(() => generatePassword())
  const [viewQuestion, setViewQuestion] = useState('')
  const [viewAnswer, setViewAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [duplicate, setDuplicate] = useState<string | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  const detectedFormat = useMemo(() => detectFormat(content), [content])

  const refreshEditPassword = useCallback(() => setEditPassword(generatePassword()), [])
  const refreshViewPassword = useCallback(() => setViewPassword(generatePassword()), [])

  function handlePreview() {
    sessionStorage.setItem('preview_content', content)
    sessionStorage.setItem('preview_format', format)
    router.push('/preview')
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = { content, format, policy: pol, view_policy: viewPol }
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

  if (result) {
    return <SuccessView result={result} policy={pol} viewPolicy={viewPol} />
  }

  if (duplicate) {
    return <DuplicateView slug={duplicate} />
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Back
        </Link>

        <h1 className="text-2xl font-bold tracking-tight mt-4 mb-8">New Sho</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Content */}
          <div>
            <textarea
              placeholder="What would you like to share?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={14}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
              autoFocus
            />
            <div className="flex justify-end mt-1.5">
              <span className="text-xs text-gray-400">
                {content.length.toLocaleString()} chars
              </span>
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Format</label>
            <div className="flex flex-wrap gap-2">
              {FORMAT_BASE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormat(opt.value)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                    format === opt.value
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.value === 'auto'
                    ? `Auto: ${detectedFormat}`
                    : opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Edit Policy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Edit Policy</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {POLICY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPol(opt.value)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${
                    pol === opt.value
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>

            {pol === 'password' && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="6-digit password"
                  maxLength={6}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
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
            )}

            {pol === 'ai-review' && (
              <textarea
                placeholder="Describe what edits should be accepted (e.g. Only accept updates that improve clarity)"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
                className="mt-3 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
              />
            )}
          </div>

          {/* View Policy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">View Policy</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {VIEW_POLICY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setViewPol(opt.value)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${
                    viewPol === opt.value
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>

            {viewPol === 'password' && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={viewPassword}
                  onChange={(e) => setViewPassword(e.target.value)}
                  placeholder="6-digit password"
                  maxLength={6}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
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
            )}

            {(viewPol === 'human-qa' || viewPol === 'ai-qa') && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  placeholder="Enter a question viewers must answer"
                  value={viewQuestion}
                  onChange={(e) => setViewQuestion(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
                />
                {viewPol === 'human-qa' && (
                  <input
                    type="text"
                    placeholder="Expected answer (exact match, case-insensitive)"
                    value={viewAnswer}
                    onChange={(e) => setViewAnswer(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
                  />
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {content.trim() ? 'Cmd+Enter to publish' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!content.trim()}
                onClick={handlePreview}
                className="border border-gray-200 text-gray-600 rounded-lg px-6 py-2.5 text-sm disabled:opacity-30 hover:border-gray-300 hover:text-gray-800 transition-colors"
              >
                Preview
              </button>
              <button
                type="submit"
                disabled={loading || !content.trim()}
                className="bg-black text-white rounded-lg px-6 py-2.5 text-sm disabled:opacity-30 hover:bg-gray-800 transition-colors"
              >
                {loading ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}

export default function NewPostPage() {
  return (
    <Suspense>
      <NewPostForm />
    </Suspense>
  )
}
