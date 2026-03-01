'use client'

import { useState } from 'react'

type Policy = 'locked' | 'open' | 'password' | 'owner-only' | 'ai-review'
type Format = 'markdown' | 'txt' | 'html' | 'jsx'

export default function NewPostPage() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [format, setFormat] = useState<Format>('markdown')
  const [pol, setPol] = useState<Policy>('locked')
  const [password, setPassword] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    manage_url: string
    edit_token: string
    slug: string
  } | null>(null)

  const [error, setError] = useState('')

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const body: Record<string, unknown> = { content, format, policy: pol }
    if (title) body.title = title
    if (slug) body.slug = slug
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
    const manageUrl = `${window.location.origin}/manage/${result.slug}?token=${result.edit_token}`
    return (
      <main className="max-w-xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Published!</h1>
        <p className="text-gray-600 mb-2">
          Save your manage link — you won&apos;t see it again:
        </p>
        <code className="block bg-gray-100 rounded p-3 text-sm break-all mb-4">
          {manageUrl}
        </code>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigator.clipboard.writeText(manageUrl)}
            className="bg-black text-white rounded px-4 py-2 text-sm"
          >
            Copy Manage Link
          </button>
          <a
            href={`/${result.slug}`}
            className="border rounded px-4 py-2 text-sm"
          >
            View Post
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">New Sho</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Content..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={12}
          className="w-full border rounded px-3 py-2 text-sm font-mono"
        />
        <div className="flex gap-4 flex-wrap">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="markdown">Markdown</option>
            <option value="txt">Plain Text</option>
            <option value="html">HTML</option>
            <option value="jsx">JSX</option>
          </select>
          <select
            value={pol}
            onChange={(e) => setPol(e.target.value as Policy)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="locked">Locked</option>
            <option value="open">Open (anyone)</option>
            <option value="password">Password</option>
            <option value="owner-only">Owner Only</option>
            <option value="ai-review">AI Review</option>
          </select>
        </div>
        {pol === 'password' && (
          <input
            type="password"
            placeholder="Set password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        )}
        {pol === 'ai-review' && (
          <textarea
            placeholder="AI review prompt (e.g. Only accept updates that improve clarity)"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={3}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        )}
        <input
          type="text"
          placeholder="Custom slug (optional)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white rounded px-6 py-2 text-sm disabled:opacity-50"
        >
          {loading ? 'Publishing...' : 'Publish'}
        </button>
      </form>
    </main>
  )
}
