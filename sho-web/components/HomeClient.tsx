'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Post {
  id: string
  slug: string
  title?: string
  content: string
  format: string
  policy: string
  views: number
  created_at: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function HomeClient({ posts }: { posts: Post[] }) {
  const [content, setContent] = useState('')
  const router = useRouter()

  const handleContinue = useCallback(() => {
    if (!content.trim()) return
    router.push(`/new?content=${encodeURIComponent(content)}`)
  }, [content, router])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleContinue()
      }
    },
    [handleContinue]
  )

  return (
    <main className="min-h-screen flex flex-col items-center px-4">
      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl pt-20 pb-8">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Sho</h1>
        <p className="text-gray-500 mb-8">Publish anything. No login required.</p>

        <div className="w-full relative">
          <textarea
            placeholder="What would you like to share?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
            autoFocus
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-400">
              {content.trim() ? 'Cmd+Enter to continue' : ''}
            </span>
            <button
              onClick={handleContinue}
              disabled={!content.trim()}
              className="bg-black text-white rounded-lg px-5 py-2 text-sm disabled:opacity-30 hover:bg-gray-800 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      {/* Recent posts */}
      {posts.length > 0 && (
        <div className="w-full max-w-2xl pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-500">Recent</h2>
            <Link
              href="/explore"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Explore more &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {posts.map((post) => {
              const preview = post.content.slice(0, 100).replace(/\n/g, ' ')
              return (
                <Link
                  key={post.id}
                  href={`/${post.slug}`}
                  className="block border border-gray-100 rounded-lg p-4 hover:border-gray-200 hover:shadow-sm transition-all"
                >
                  <p className="font-medium text-sm truncate mb-1">
                    {post.title || `/${post.slug}`}
                  </p>
                  <p className="text-xs text-gray-400 line-clamp-2 mb-2">{preview}</p>
                  <div className="flex gap-2 text-xs text-gray-300">
                    <span>{post.format}</span>
                    <span>&middot;</span>
                    <span>{timeAgo(post.created_at)}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </main>
  )
}
