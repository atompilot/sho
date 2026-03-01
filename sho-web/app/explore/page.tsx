'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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

export default function ExplorePage() {
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchPosts = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const url = q
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/posts/search?q=${encodeURIComponent(q)}&limit=20`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/v1/posts?limit=20`
      const res = await fetch(url)
      if (res.ok) {
        setPosts(await res.json())
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts('')
  }, [fetchPosts])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchPosts(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, fetchPosts])

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            &larr; Home
          </Link>
          <h1 className="text-xl font-bold">Explore</h1>
        </div>
        <Link
          href="/new"
          className="bg-black text-white text-sm rounded px-4 py-2 hover:bg-gray-800 transition-colors"
        >
          New Sho
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search posts..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
        autoFocus
      />

      {loading ? (
        <p className="text-center text-gray-400 py-12">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-center text-gray-400 py-12">
          {query ? 'No results found.' : 'No posts yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {posts.map((post) => {
            const preview = post.content.slice(0, 120).replace(/\n/g, ' ')
            return (
              <li key={post.id}>
                <Link
                  href={`/${post.slug}`}
                  className="block py-4 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-sm truncate">
                      {post.title || `/${post.slug}`}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {timeAgo(post.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{preview}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    <span>{post.format}</span>
                    <span>&middot;</span>
                    <span>{post.policy}</span>
                    <span>&middot;</span>
                    <span>{post.views} views</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
