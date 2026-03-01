'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

interface PostVersion {
  id: string
  post_id: string
  content: string
  edited_by: string | null
  created_at: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

export default function EditHistoryPage() {
  const params = useParams()
  const slug = params.slug as string

  const [versions, setVersions] = useState<PostVersion[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/posts/${slug}/versions?limit=50`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load')
        return r.json()
      })
      .then(data => {
        setVersions(data.versions || [])
        setTotal(data.total || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Loading...</span>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
          <Link href={`/${slug}`} className="hover:text-gray-600 transition-colors">&larr; View post</Link>
          <span className="text-gray-300">|</span>
          <Link href={`/edit/${slug}`} className="hover:text-gray-600 transition-colors">Back to editor</Link>
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Edit History <span className="text-gray-400">/{slug}</span>
        </h1>
        <p className="text-sm text-gray-400 mb-8">
          {total} {total === 1 ? 'version' : 'versions'}
        </p>

        {versions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">No edit history yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {versions.map((v, idx) => (
              <div
                key={v.id}
                className="border border-gray-200 rounded-xl overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Timeline dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      idx === 0 ? 'bg-black' : 'bg-gray-300'
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" title={formatDate(v.created_at)}>
                          {timeAgo(v.created_at)}
                        </span>
                        {idx === 0 && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            Latest
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {v.edited_by || 'anonymous'}
                        {' · '}
                        {v.content.length.toLocaleString()} chars
                      </p>
                    </div>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`text-gray-400 transition-transform ${expandedId === v.id ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {expandedId === v.id && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                    <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-words max-h-96 overflow-auto">
                      {v.content}
                    </pre>
                    <p className="text-xs text-gray-400 mt-3">{formatDate(v.created_at)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
