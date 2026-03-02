'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

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

type SortMode = 'recommended' | 'latest'
type FormatFilter = '' | 'markdown' | 'html' | 'jsx'

const FORMAT_FILTERS: { value: FormatFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'jsx', label: 'JSX' },
]

function displayFormat(fmt: string): string {
  return fmt === 'txt' ? 'markdown' : fmt
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
  const [sortMode, setSortMode] = useState<SortMode>('recommended')
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const buildUrl = useCallback((q: string, mode: SortMode, fmt: FormatFilter) => {
    const base = process.env.NEXT_PUBLIC_API_URL
    const fmtParam = fmt ? `&format=${fmt}` : ''
    if (q) {
      return `${base}/api/v1/posts/search?q=${encodeURIComponent(q)}&limit=30${fmtParam}`
    }
    if (mode === 'recommended') {
      return `${base}/api/v1/posts/recommended?limit=30${fmtParam}`
    }
    return `${base}/api/v1/posts?limit=30${fmtParam}`
  }, [])

  const fetchPosts = useCallback(async (q: string, mode: SortMode, fmt: FormatFilter) => {
    setLoading(true)
    try {
      const res = await fetch(buildUrl(q, mode, fmt))
      if (res.ok) setPosts(await res.json())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [buildUrl])

  useEffect(() => {
    fetchPosts('', sortMode, formatFilter)
  }, [fetchPosts, sortMode, formatFilter])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchPosts(query, sortMode, formatFilter)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, sortMode, formatFilter, fetchPosts])

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            &larr; Home
          </Link>
          <h1 className="text-xl font-bold">Explore</h1>
        </div>
        <Link
          href="/"
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
        className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
        autoFocus
      />

      <div className="flex items-center justify-between mb-6">
        {/* Sort toggle — hidden while searching */}
        {!query ? (
          <div className="flex gap-1">
            <button
              onClick={() => setSortMode('recommended')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                sortMode === 'recommended'
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ✦ Recommended
            </button>
            <button
              onClick={() => setSortMode('latest')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                sortMode === 'latest'
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Latest
            </button>
          </div>
        ) : (
          <div />
        )}

        {/* Format filter */}
        <div className="flex gap-1">
          {FORMAT_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFormatFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                formatFilter === f.value
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-center text-gray-400 py-12">
          {query ? 'No results found.' : 'No posts yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/${post.slug}`}
              className="relative border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all flex flex-col justify-between min-h-[100px]"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-medium text-sm line-clamp-2 flex-1">
                  {post.ai_title || post.title || `/${post.slug}`}
                </span>
                <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
                  {displayFormat(post.format)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                <span>{post.views} views</span>
                {post.likes > 0 && <span>{post.likes} likes</span>}
                {post.last_viewed_at && <span>visited {timeAgo(post.last_viewed_at)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
