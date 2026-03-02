'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { StaggerContainer, StaggerItem } from '@/components/ui/MotionWrapper'

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
      <main className="min-h-[100dvh] flex items-center justify-center bg-white">
        <div className="skeleton h-4 w-24" />
      </main>
    )
  }

  if (!post) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center px-4 bg-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Post not found</h1>
          <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">Back home</Link>
        </div>
      </main>
    )
  }

  if (post.policy === 'locked') {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center px-4 bg-white">
        <div className="w-full max-w-md text-center">
          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-8">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Locked</h1>
            <p className="text-sm text-slate-500 mb-6">This post is locked and cannot be edited.</p>
            <Link
              href={`/${slug}`}
              className="inline-block bg-slate-800 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-slate-900 transition-colors"
            >
              View post
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center px-4 py-16 bg-white">
      <StaggerContainer className="w-full max-w-2xl">
        <StaggerItem>
          <Link
            href={`/${slug}`}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Back to post
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-4 mb-8">
            Edit <span className="text-slate-400">/{slug}</span>
          </h1>
        </StaggerItem>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Content */}
          <StaggerItem>
            <label className="block text-sm font-medium text-slate-700 mb-2">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={14}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 hover:border-slate-300 transition-all"
              autoFocus
            />
            <div className="flex justify-end mt-1.5">
              <span className="text-xs text-slate-400">
                {content.length.toLocaleString()} chars
              </span>
            </div>
          </StaggerItem>

          {/* Format */}
          <StaggerItem>
            <label className="block text-sm font-medium text-slate-700 mb-2">Format</label>
            <span className="inline-block px-4 py-1.5 rounded-full text-sm bg-slate-800 text-white">
              {post.format}
            </span>
          </StaggerItem>

          {/* Password */}
          {post.policy === 'password' && (
            <StaggerItem>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <input
                type="password"
                placeholder="Enter password to edit"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 hover:border-slate-300 transition-all"
              />
            </StaggerItem>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Actions */}
          <StaggerItem>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AnimatePresence mode="wait">
                  {!confirmDelete ? (
                    <motion.button
                      key="delete-btn"
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="text-sm text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Delete
                    </motion.button>
                  ) : (
                    <motion.div
                      key="confirm-delete"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
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
                        className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex items-center gap-2">
                {post.version_count > 0 && (
                  <Link
                    href={`/edit/${slug}/history`}
                    className="border border-slate-200 text-slate-600 rounded-xl px-5 py-2.5 text-sm hover:border-slate-300 hover:text-slate-800 transition-colors"
                  >
                    History ({post.version_count})
                  </Link>
                )}
                <motion.button
                  type="submit"
                  disabled={saving || !content.trim()}
                  whileTap={{ scale: 0.98 }}
                  className="bg-slate-800 text-white rounded-xl px-6 py-2.5 text-sm font-medium disabled:opacity-30 hover:bg-slate-900 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </motion.button>
              </div>
            </div>
          </StaggerItem>
        </form>
      </StaggerContainer>
    </main>
  )
}
