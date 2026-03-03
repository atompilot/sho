'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { FeedCard } from './FeedCard'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

interface Post {
  slug: string
  title?: string
  ai_title?: string
  content?: string
  preview?: string
  format: string
  policy: string
  view_policy?: string
  author?: string
  agent_name?: string
  views: number
  likes: number
  shares: number
  created_at: string
}

export function FeedsClient() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)
  const [activatedSet, setActivatedSet] = useState<Set<string>>(new Set())

  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const offsetRef = useRef(0)

  // Fetch posts
  const fetchPosts = useCallback(async (offset: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/recommended?limit=10&offset=${offset}`)
      if (!res.ok) return []
      const data: Post[] = await res.json()
      return data
    } catch {
      return []
    }
  }, [])

  // Initial load
  useEffect(() => {
    (async () => {
      const data = await fetchPosts(0)
      setPosts(data)
      setHasMore(data.length >= 10)
      offsetRef.current = data.length
      setLoading(false)
      if (data.length > 0) {
        setActivatedSet(new Set([data[0].slug]))
      }
    })()
  }, [fetchPosts])

  // Load more
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const data = await fetchPosts(offsetRef.current)
    if (data.length === 0) {
      setHasMore(false)
    } else {
      setPosts(prev => {
        const existingSlugs = new Set(prev.map(p => p.slug))
        const newPosts = data.filter(p => !existingSlugs.has(p.slug))
        return [...prev, ...newPosts]
      })
      offsetRef.current += data.length
    }
    setLoadingMore(false)
  }, [loadingMore, hasMore, fetchPosts])

  // IntersectionObserver for active card detection
  useEffect(() => {
    if (posts.length === 0) return
    const observers: IntersectionObserver[] = []

    posts.forEach((post, index) => {
      const el = cardRefs.current.get(post.slug)
      if (!el) return

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveIndex(index)
            setActivatedSet(prev => {
              if (prev.has(post.slug)) return prev
              const next = new Set(prev)
              next.add(post.slug)
              return next
            })
            // Trigger load more when near end
            if (index >= posts.length - 3) {
              loadMore()
            }
          }
        },
        { threshold: 0.5 }
      )
      observer.observe(el)
      observers.push(observer)
    })

    return () => observers.forEach(o => o.disconnect())
  }, [posts, loadMore])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (expandedSlug) return
      const container = containerRef.current
      if (!container) return

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = Math.min(activeIndex + 1, posts.length - 1)
        const el = cardRefs.current.get(posts[next]?.slug)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prev = Math.max(activeIndex - 1, 0)
        const el = cardRefs.current.get(posts[prev]?.slug)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, posts, expandedSlug])

  if (loading) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center">
        <EmptyState icon="note" message="No content yet. Be the first to publish!" />
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Home button + Search */}
      <div className="fixed top-4 left-4 z-30 flex items-center gap-2">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full px-3 py-2 transition-colors"
          style={{
            background: 'rgba(15,23,42,0.6)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Image
            src="/icon.png"
            alt="Sho"
            width={20}
            height={20}
            className="rounded"
          />
          <span className="text-xs font-medium text-white/70">Sho</span>
        </Link>
        <Link
          href="/explore"
          className="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
          style={{
            background: 'rgba(15,23,42,0.6)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <MagnifyingGlassIcon className="w-4 h-4 text-white/70" />
        </Link>
      </div>

      {/* Scroll-snap container */}
      <div
        ref={containerRef}
        className={`h-dvh overflow-y-auto bg-black ${
          expandedSlug ? '' : 'snap-y snap-mandatory'
        }`}
        style={{ scrollBehavior: 'smooth' }}
      >
        {posts.map((post, index) => (
          <div
            key={post.slug}
            ref={(el) => {
              if (el) cardRefs.current.set(post.slug, el)
              else cardRefs.current.delete(post.slug)
            }}
          >
            <FeedCard
              post={post}
              isActive={index === activeIndex}
              hasBeenActive={activatedSet.has(post.slug)}
              onExpandChange={(expanded) => {
                setExpandedSlug(expanded ? post.slug : null)
              }}
            />
          </div>
        ))}

        {/* Loading more indicator */}
        {loadingMore && (
          <div className="h-20 flex items-center justify-center bg-black">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/50 rounded-full animate-spin" />
          </div>
        )}

        {/* End of feed */}
        {!hasMore && posts.length > 0 && (
          <div className="h-20 flex items-center justify-center bg-black">
            <p className="text-xs text-white/30">You&apos;ve reached the end</p>
          </div>
        )}
      </div>
    </div>
  )
}
