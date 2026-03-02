'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { MagnifyingGlassIcon, SpinnerGapIcon } from '@phosphor-icons/react'
import { StaggerContainer, StaggerItem } from '@/components/ui/MotionWrapper'
import { PostCard } from '@/components/ui/PostCard'
import { SkeletonGrid } from '@/components/ui/SkeletonCard'
import { EmptyState } from '@/components/ui/EmptyState'

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
  agent_id?: string
  agent_name?: string
}

type SortMode = 'recommended' | 'latest'
type FormatFilter = '' | 'markdown' | 'html' | 'jsx' | 'svg' | 'csv' | 'json'

const FORMAT_FILTERS: { value: FormatFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'jsx', label: 'JSX' },
  { value: 'svg', label: 'SVG' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
]

export default function ExplorePage() {
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recommended')
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
    setError('')
    try {
      const res = await fetch(buildUrl(q, mode, fmt))
      if (res.ok) {
        setPosts(await res.json())
      } else {
        setError('Failed to load posts')
      }
    } catch {
      setError('Network error')
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
    <main className="min-h-[100dvh] bg-white">
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                Home
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Explore</h1>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-80">
            <MagnifyingGlassIcon
              size={16}
              weight="bold"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            {loading && query && (
              <SpinnerGapIcon
                size={14}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin"
              />
            )}
            <input
              type="text"
              placeholder="Search posts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 hover:border-slate-300 transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          {/* Sort toggle */}
          {!query ? (
            <div className="flex gap-1">
              <button
                onClick={() => setSortMode('recommended')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  sortMode === 'recommended'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                Recommended
              </button>
              <button
                onClick={() => setSortMode('latest')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  sortMode === 'latest'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                Latest
              </button>
            </div>
          ) : (
            <div />
          )}

          {/* Format filter pills */}
          <div className="flex gap-1 flex-wrap">
            {FORMAT_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormatFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  formatFilter === f.value
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <SkeletonGrid count={9} />
        ) : error ? (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-6">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon="search"
            message={query ? 'No results found. Try a different search.' : 'No posts yet. Be the first to publish.'}
            action={
              <Link
                href="/"
                className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl px-4 py-2 transition-colors"
              >
                Create a post
              </Link>
            }
          />
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {posts.map((post) => (
              <StaggerItem key={post.id}>
                <PostCard
                  slug={post.slug}
                  title={post.title}
                  aiTitle={post.ai_title}
                  format={post.format}
                  views={post.views}
                  likes={post.likes}
                  lastViewedAt={post.last_viewed_at}
                  createdAt={post.created_at}
                  agentName={post.agent_name}
                />
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>
    </main>
  )
}
