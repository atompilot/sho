'use client'

import { useState, Suspense, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { detectFormat } from '@/lib/detectFormat'

type Policy = 'locked' | 'open' | 'password' | 'owner-only' | 'ai-review'
type Format = 'auto' | 'markdown' | 'txt' | 'html' | 'jsx'

const FORMAT_BASE_OPTIONS: { value: Format; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'txt', label: 'Text' },
  { value: 'html', label: 'HTML' },
  { value: 'jsx', label: 'JSX' },
]

const POLICY_OPTIONS: { value: Policy; label: string; desc: string }[] = [
  { value: 'locked', label: 'Locked', desc: 'No edits allowed after publishing' },
  { value: 'open', label: 'Open', desc: 'Anyone can edit' },
  { value: 'password', label: 'Password', desc: 'Require password to edit' },
  { value: 'owner-only', label: 'Owner Only', desc: 'Only you can edit (via manage link)' },
  { value: 'ai-review', label: 'AI Review', desc: 'AI reviews edits before applying' },
]

const POLICY_SUCCESS_MSG: Record<Policy, string> = {
  locked: 'Published and locked. No further edits.',
  open: 'Published. Anyone can edit.',
  password: 'Published. Password required to edit.',
  'owner-only': 'Published. Save your manage link — you won\'t see it again.',
  'ai-review': 'Published. AI will review edits.',
}

function SuccessView({ slug, editToken, policy }: { slug: string; editToken: string; policy: Policy }) {
  const manageUrl = `${window.location.origin}/manage/${slug}?token=${editToken}`
  const [copied, setCopied] = useState(false)
  const showManageLink = policy === 'owner-only'

  function handleCopy() {
    navigator.clipboard.writeText(manageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="border border-gray-200 rounded-xl p-8">
          <div className="text-4xl mb-4">&#x2713;</div>
          <h1 className="text-xl font-semibold mb-2">Published</h1>
          <p className="text-sm text-gray-500 mb-6">
            {POLICY_SUCCESS_MSG[policy]}
          </p>

          {showManageLink && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <code className="text-xs text-gray-600 break-all leading-relaxed">
                {manageUrl}
              </code>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            {showManageLink && (
              <button
                onClick={handleCopy}
                className="bg-black text-white rounded-lg px-5 py-2.5 text-sm hover:bg-gray-800 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Manage Link'}
              </button>
            )}
            <Link
              href={`/${slug}`}
              className={showManageLink
                ? 'border border-gray-200 rounded-lg px-5 py-2.5 text-sm hover:border-gray-300 transition-colors'
                : 'bg-black text-white rounded-lg px-5 py-2.5 text-sm hover:bg-gray-800 transition-colors'}
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

function NewPostForm() {
  const searchParams = useSearchParams()
  const initialContent = searchParams.get('content') || ''
  const [content, setContent] = useState(initialContent)
  const [format, setFormat] = useState<Format>('auto')
  const [pol, setPol] = useState<Policy>('locked')
  const [password, setPassword] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ edit_token: string; slug: string } | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  const detectedFormat = useMemo(() => detectFormat(content), [content])

  function handlePreview() {
    sessionStorage.setItem('preview_content', content)
    sessionStorage.setItem('preview_format', format)
    router.push('/preview')
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = { content, format, policy: pol }
    if (pol === 'password' && password) body.password = password
    if (pol === 'ai-review' && aiPrompt) body.ai_review_prompt = aiPrompt

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
      if (!res.ok) throw new Error(data.error || 'Failed to publish')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return <SuccessView slug={result.slug} editToken={result.edit_token} policy={pol} />
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

          {/* Policy */}
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

            {/* Password input */}
            {pol === 'password' && (
              <input
                type="password"
                placeholder="Set a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-3 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
              />
            )}

            {/* AI prompt input */}
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
