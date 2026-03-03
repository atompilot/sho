'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
} from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { UnifiedCard } from '@/components/UnifiedCard'
import { usePostComments, buildCommentThreads, timeAgo } from '@/hooks/usePostActions'
import type { Post } from '@/types/post'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

export function UnifiedFeedClient({ initialPost }: { initialPost?: Post }) {
  const [posts, setPosts] = useState<Post[]>(initialPost ? [initialPost] : [])
  const [loading, setLoading] = useState(!initialPost)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)
  const [activatedSet, setActivatedSet] = useState<Set<string>>(
    new Set(initialPost ? [initialPost.slug] : [])
  )
  const [sourceViewSlug, setSourceViewSlug] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const offsetRef = useRef(0)
  const replaceStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Active slug derived from state
  const activeSlug = posts[activeIndex]?.slug

  // Shared comments panel — operates on activeSlug
  const commentsHook = usePostComments(activeSlug || '')

  // Shared share panel state (separate from per-card API calls)
  const [shareSlug, setShareSlug] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState('')
  const sharePost = posts.find(p => p.slug === shareSlug)

  const handleShareCopy = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value)
    setShareCopied(label)
    setTimeout(() => setShareCopied(''), 1500)
  }, [])

  // Fetch recommended posts
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
      if (initialPost) {
        // Append recommended posts, excluding the initial post
        const filtered = data.filter(p => p.slug !== initialPost.slug)
        setPosts(prev => [...prev, ...filtered])
        offsetRef.current = data.length
      } else {
        setPosts(data)
        offsetRef.current = data.length
        if (data.length > 0) {
          setActivatedSet(new Set([data[0].slug]))
        }
      }
      setHasMore(data.length >= 10)
      setLoading(false)
    })()
  }, [fetchPosts, initialPost])

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
            // Reset source mode when scrolling away
            setSourceViewSlug(prev => prev === post.slug ? prev : null)
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

  // URL sync with debounce
  useEffect(() => {
    if (!activeSlug) return
    if (replaceStateTimer.current) clearTimeout(replaceStateTimer.current)
    replaceStateTimer.current = setTimeout(() => {
      const newUrl = `/${activeSlug}`
      if (window.location.pathname !== newUrl) {
        history.replaceState(null, '', newUrl)
      }
    }, 150)
    return () => {
      if (replaceStateTimer.current) clearTimeout(replaceStateTimer.current)
    }
  }, [activeSlug])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (expandedSlug) return
      // Don't intercept when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
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

  const shareDisplayTitle = sharePost?.title || sharePost?.ai_title || ''

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
          <Image src="/icon.png" alt="Sho" width={20} height={20} className="rounded" />
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
            <UnifiedCard
              post={post}
              isActive={index === activeIndex}
              hasBeenActive={activatedSet.has(post.slug)}
              sourceMode={sourceViewSlug === post.slug}
              onToggleSource={() => {
                setSourceViewSlug(prev => prev === post.slug ? null : post.slug)
              }}
              onOpenComments={() => commentsHook.openComments()}
              onOpenShare={() => setShareSlug(post.slug)}
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

      {/* Shared Share Panel */}
      <AnimatePresence>
        {shareSlug && sharePost && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShareSlug(null)}
              className="fixed inset-0 bg-slate-950/50 z-[59]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-[60] rounded-2xl overflow-hidden p-6"
              style={{
                background: 'rgba(15,23,42,0.97)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-white text-sm font-semibold">Share</span>
                <button onClick={() => setShareSlug(null)} className="text-white/40 hover:text-white/70 transition-colors">
                  <XIcon size={18} />
                </button>
              </div>
              <div className="bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 space-y-2">
                {shareDisplayTitle && (
                  <div>
                    <div className="text-[11px] text-white/40 mb-0.5">Title</div>
                    <div className="text-sm text-white/90">{shareDisplayTitle}</div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] text-white/40 mb-0.5">Link</div>
                  <div className="text-sm text-white/90 break-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/${shareSlug}` : `/${shareSlug}`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  const link = typeof window !== 'undefined' ? `${window.location.origin}/${shareSlug}` : `/${shareSlug}`
                  const text = shareDisplayTitle ? `${shareDisplayTitle}\n${link}` : link
                  handleShareCopy('all', text)
                }}
                className="w-full mt-3 flex items-center justify-center gap-2 bg-white/[0.1] hover:bg-white/[0.15] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white/90 font-medium transition-colors"
              >
                {shareCopied === 'all' ? <><CheckIcon size={16} weight="bold" /> Copied</> : <><CopyIcon size={16} /> Copy</>}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Shared Comments Panel */}
      <AnimatePresence>
        {commentsHook.showComments && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { commentsHook.setShowComments(false); commentsHook.setReplyTo(null) }}
              className="fixed inset-0 bg-slate-950/50 z-[59]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-[60] flex flex-col rounded-t-2xl overflow-hidden"
              style={{
                height: 'min(60vh, 500px)',
                background: 'rgba(15,23,42,0.97)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
              }}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                <span className="text-white text-sm font-semibold">
                  Comments {commentsHook.commentsCount > 0 ? `(${commentsHook.commentsCount})` : ''}
                </span>
                <button onClick={() => { commentsHook.setShowComments(false); commentsHook.setReplyTo(null) }} className="text-white/40 hover:text-white/70 transition-colors">
                  <XIcon size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-2">
                {commentsHook.comments.length === 0 ? (
                  <p className="text-white/30 text-sm text-center mt-8">No comments yet. Be the first.</p>
                ) : (
                  buildCommentThreads(commentsHook.comments).map((thread, idx) => (
                    <motion.div
                      key={thread.comment.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="py-3 border-b border-white/[0.05]"
                    >
                      <p className="text-white/90 text-sm leading-relaxed">{thread.comment.content}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-white/25 text-[11px]">{timeAgo(thread.comment.created_at)}</span>
                        <button
                          onClick={() => commentsHook.setReplyTo({ id: thread.comment.id, content: thread.comment.content })}
                          className="text-white/35 hover:text-white/60 text-[11px] transition-colors"
                        >
                          Reply
                        </button>
                      </div>
                      {thread.replies.length > 0 && (
                        <div className="ml-5 mt-2 border-l-2 border-white/[0.06] pl-3">
                          {thread.replies.map(reply => (
                            <div key={reply.id} className="py-2">
                              <p className="text-white/80 text-[13px] leading-relaxed">{reply.content}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-white/20 text-[11px]">{timeAgo(reply.created_at)}</span>
                                <button
                                  onClick={() => commentsHook.setReplyTo({ id: reply.id, content: reply.content })}
                                  className="text-white/30 hover:text-white/60 text-[11px] transition-colors"
                                >
                                  Reply
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
              <div className="px-5 py-3 border-t border-white/[0.06]">
                {commentsHook.replyTo && (
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-white/35 text-xs">
                      Replying to: {commentsHook.replyTo.content.length > 30 ? commentsHook.replyTo.content.slice(0, 30) + '...' : commentsHook.replyTo.content}
                    </span>
                    <button onClick={() => commentsHook.setReplyTo(null)} className="text-white/30 hover:text-white/50 transition-colors">
                      <XIcon size={14} />
                    </button>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <input
                    value={commentsHook.commentInput}
                    onChange={e => commentsHook.setCommentInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commentsHook.submitComment() } }}
                    placeholder={commentsHook.replyTo ? 'Write a reply...' : 'Write a comment...'}
                    className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
                  />
                  <button
                    onClick={commentsHook.submitComment}
                    disabled={commentsHook.submitting || !commentsHook.commentInput.trim()}
                    className="bg-orange-500 hover:bg-orange-600 disabled:bg-white/10 text-white rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-default"
                  >
                    Send
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
