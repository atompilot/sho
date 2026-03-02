'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

interface PostData {
  slug: string
  content: string
  format: string
  policy: string
  version_count: number
}

export default function EditPostPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = params.slug as string

  const [post, setPost] = useState<PostData | null>(null)
  const [content, setContent] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/posts/${slug}`)
      .then(r => {
        if (!r.ok) throw new Error('Post not found')
        return r.json()
      })
      .then((data: PostData) => {
        setPost(data)
        setContent(data.content)
      })
      .catch(() => setError('Failed to load post'))
      .finally(() => setLoading(false))
  }, [slug])

  function getCredential() {
    if (post?.policy === 'password') return password
    if (post?.policy === 'owner-only') return searchParams.get('token') || ''
    return ''
  }

  async function handleDelete() {
    if (!post) return
    setDeleting(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${slug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: getCredential() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to delete' }))
        setError(data.error || `Error ${res.status}`)
        return
      }
      router.push('/')
    } catch {
      setError('Network error')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!post) return
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, credential: getCredential() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to save' }))
        if (data.error === 'ai_review_rejected') {
          setError(`AI Review rejected: ${data.reason}`)
        } else {
          setError(data.error || `Error ${res.status}`)
        }
        return
      }
      router.push(`/${slug}`)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Loading...</span>
      </main>
    )
  }

  if (!post) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Post not found</h1>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">&larr; Back home</Link>
        </div>
      </main>
    )
  }

  if (post.policy === 'locked') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-8">
            <div className="text-4xl mb-4">&#x1F512;</div>
            <h1 className="text-xl font-semibold mb-2">Locked</h1>
            <p className="text-sm text-gray-500 mb-6">This post is locked and cannot be edited.</p>
            <Link
              href={`/${slug}`}
              className="inline-block bg-black text-white rounded-lg px-5 py-2.5 text-sm hover:bg-gray-800 transition-colors"
            >
              View post &rarr;
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <Link
          href={`/${slug}`}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Back to post
        </Link>

        <h1 className="text-2xl font-bold tracking-tight mt-4 mb-8">
          Edit <span className="text-gray-400">/{slug}</span>
        </h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Content */}
          <div>
            <textarea
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

          {/* Format (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Format</label>
            <div className="flex flex-wrap gap-2">
              <span className="px-4 py-1.5 rounded-full text-sm bg-black text-white">
                {post.format}
              </span>
            </div>
          </div>

          {/* Password input for password-protected posts */}
          {post.policy === 'password' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Password</label>
              <input
                type="password"
                placeholder="Enter password to edit"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>
          )}

          {/* Submit + History + Delete */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-sm text-gray-400 hover:text-red-500 transition-colors"
                >
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2 animate-fade-up">
                  <span className="text-xs text-red-500">Are you sure?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-sm text-red-600 font-medium hover:text-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Yes, delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {post.version_count > 0 && (
                <Link
                  href={`/edit/${slug}/history`}
                  className="border border-gray-200 text-gray-600 rounded-lg px-5 py-2.5 text-sm hover:border-gray-300 hover:text-gray-800 transition-colors"
                >
                  History ({post.version_count})
                </Link>
              )}
              <button
                type="submit"
                disabled={saving || !content.trim()}
                className="bg-black text-white rounded-lg px-6 py-2.5 text-sm disabled:opacity-30 hover:bg-gray-800 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}
