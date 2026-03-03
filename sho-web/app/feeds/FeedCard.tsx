'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HeartIcon,
  ChatCircleIcon,
  ShareNetworkIcon,
  ArrowSquareOutIcon,
  LockKeyIcon,
  CaretDownIcon,
  CaretUpIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
} from '@phosphor-icons/react'
import { ContentRenderer } from '@/components/ContentRenderer'
import { FormatBadge } from '@/components/ui/FormatBadge'

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

interface Comment {
  id: string
  post_id: string
  parent_id: string | null
  content: string
  created_at: string
}

interface CommentThread {
  comment: Comment
  replies: Comment[]
}

function buildCommentThreads(comments: Comment[]): CommentThread[] {
  const topLevel: Comment[] = []
  const childMap = new Map<string, Comment[]>()
  for (const c of comments) {
    if (c.parent_id == null) {
      topLevel.push(c)
    } else {
      const arr = childMap.get(c.parent_id) || []
      arr.push(c)
      childMap.set(c.parent_id, arr)
    }
  }
  topLevel.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return topLevel.map(c => ({ comment: c, replies: childMap.get(c.id) || [] }))
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

const IFRAME_FORMATS = ['html', 'jsx', 'svg', 'lottie', 'p5', 'reveal', 'glsl']

export function FeedCard({
  post,
  hasBeenActive,
  onExpandChange,
}: {
  post: Post
  isActive?: boolean
  hasBeenActive: boolean
  onExpandChange?: (expanded: boolean) => void
}) {
  const [likes, setLikes] = useState(post.likes ?? 0)
  const [liked, setLiked] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [commentsCount, setCommentsCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null)
  const [shares, setShares] = useState(post.shares ?? 0)
  const [shared, setShared] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareCopied, setShareCopied] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const isIframe = IFRAME_FORMATS.includes(post.format)
  const isProtected = post.view_policy && post.view_policy !== 'open'
  const hasContent = !!post.content
  const displayTitle = post.title || post.ai_title || ''

  // Check liked from localStorage
  useEffect(() => {
    if (localStorage.getItem(`liked:${post.slug}`) === '1') {
      setLiked(true)
    }
  }, [post.slug])

  // Overflow detection for text formats
  useEffect(() => {
    if (isIframe || !contentRef.current) return
    const el = contentRef.current
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 10)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isIframe, hasBeenActive])

  const handleLike = useCallback(async () => {
    if (liked) return
    const prev = likes
    setLikes(l => l + 1)
    setLiked(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${post.slug}/like`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setLikes(data.likes)
        localStorage.setItem(`liked:${post.slug}`, '1')
      } else {
        setLikes(prev)
        setLiked(false)
      }
    } catch {
      setLikes(prev)
      setLiked(false)
    }
  }, [liked, likes, post.slug])

  const openComments = useCallback(async () => {
    setShowComments(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${post.slug}/comments`)
      if (res.ok) {
        const data: Comment[] = await res.json()
        setComments(data)
        setCommentsCount(data.length)
      }
    } catch { /* ignore */ }
  }, [post.slug])

  const submitComment = useCallback(async () => {
    if (!commentInput.trim() || submitting) return
    setSubmitting(true)
    try {
      const body: Record<string, string> = { content: commentInput.trim() }
      if (replyTo) body.parent_id = replyTo.id
      const res = await fetch(`${API_BASE}/api/v1/posts/${post.slug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const newComment: Comment = await res.json()
        setComments(prev => [...prev, newComment])
        setCommentsCount(c => c + 1)
        setCommentInput('')
        setReplyTo(null)
      }
    } catch { /* ignore */ } finally {
      setSubmitting(false)
    }
  }, [commentInput, submitting, replyTo, post.slug])

  const handleShare = useCallback(async () => {
    setShowShare(true)
    if (shared) return
    const prev = shares
    setShares(s => s + 1)
    setShared(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${post.slug}/share`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setShares(data.shares)
      } else {
        setShares(prev)
        setShared(false)
      }
    } catch {
      setShares(prev)
      setShared(false)
    }
  }, [shared, shares, post.slug])

  const handleShareCopy = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value)
    setShareCopied(label)
    setTimeout(() => setShareCopied(''), 1500)
  }, [])

  const toggleExpand = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    onExpandChange?.(next)
    if (!next && cardRef.current) {
      cardRef.current.scrollIntoView({ block: 'start' })
    }
  }, [expanded, onExpandChange])

  return (
    <div
      ref={cardRef}
      className={`relative bg-black ${
        expanded
          ? 'min-h-dvh snap-align-none'
          : 'h-dvh snap-start snap-always'
      } overflow-hidden`}
    >
      {/* Content area */}
      <div
        ref={contentRef}
        className={`absolute inset-0 ${expanded ? 'overflow-y-auto' : 'overflow-hidden'}`}
      >
        {isProtected ? (
          <div className="flex flex-col items-center justify-center h-full text-white/60 gap-4">
            <LockKeyIcon size={48} weight="light" className="text-white/30" />
            <p className="text-sm">This content is protected</p>
            <Link
              href={`/${post.slug}`}
              className="text-sm text-orange-400 hover:text-orange-300 transition-colors underline underline-offset-2"
            >
              View full page to unlock
            </Link>
          </div>
        ) : hasContent && hasBeenActive ? (
          <ContentRenderer
            content={post.content!}
            format={post.format as any}
            mode="feed"
            slug={post.slug}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Right action bar */}
      <div className="absolute right-3 bottom-48 z-10 flex flex-col items-center gap-1 rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(15,23,42,0.7)',
          backdropFilter: 'blur(16px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.6)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <button
          onClick={handleLike}
          className="w-12 min-h-[52px] flex flex-col items-center justify-center gap-0.5 bg-transparent border-none cursor-pointer py-2 transition-colors"
          style={{ color: liked ? '#f87171' : 'rgba(255,255,255,0.85)' }}
        >
          <HeartIcon size={22} weight={liked ? 'fill' : 'regular'} />
          <span className="text-[10px] leading-none opacity-80">{likes}</span>
        </button>
        <div className="h-px mx-2 w-8" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button
          onClick={openComments}
          className="w-12 min-h-[48px] flex flex-col items-center justify-center gap-0.5 bg-transparent border-none cursor-pointer py-2 transition-colors"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          <ChatCircleIcon size={22} weight="regular" />
          {commentsCount > 0 && <span className="text-[10px] leading-none opacity-80">{commentsCount}</span>}
        </button>
        <div className="h-px mx-2 w-8" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button
          onClick={handleShare}
          className="w-12 min-h-[52px] flex flex-col items-center justify-center gap-0.5 bg-transparent border-none cursor-pointer py-2 transition-colors"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          <ShareNetworkIcon size={22} weight="regular" />
          {shares > 0 && <span className="text-[10px] leading-none opacity-80">{shares}</span>}
        </button>
        <div className="h-px mx-2 w-8" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <Link
          href={`/${post.slug}`}
          className="w-12 min-h-[48px] flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          <ArrowSquareOutIcon size={22} weight="regular" />
        </Link>
      </div>

      {/* Bottom metadata overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div
          className="px-5 pb-6 pt-20 pointer-events-auto"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <FormatBadge format={post.format} />
            {(post.author || post.agent_name) && (
              <span className="text-xs text-white/60">
                {post.author || post.agent_name}
              </span>
            )}
            <span className="text-xs text-white/35">
              {timeAgo(post.created_at)}
            </span>
          </div>
          {displayTitle && (
            <h2 className="text-white text-base font-semibold leading-snug line-clamp-2 mb-1.5 max-w-[calc(100%-60px)]">
              {displayTitle}
            </h2>
          )}
          <div className="flex items-center gap-3 text-xs text-white/45">
            <span>{post.views} views</span>
            <span>{likes} likes</span>
          </div>

          {/* Expand/Collapse button for overflowing text content */}
          {!isIframe && overflows && (
            <button
              onClick={toggleExpand}
              className="mt-3 flex items-center gap-1.5 text-xs text-white/70 hover:text-white/90 transition-colors bg-white/10 hover:bg-white/15 backdrop-blur-sm rounded-full px-3.5 py-1.5 border border-white/10"
            >
              {expanded ? (
                <>
                  <CaretUpIcon size={14} weight="bold" />
                  Close details
                </>
              ) : (
                <>
                  <CaretDownIcon size={14} weight="bold" />
                  View full content
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Share Panel */}
      <AnimatePresence>
        {showShare && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShare(false)}
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
                <button onClick={() => setShowShare(false)} className="text-white/40 hover:text-white/70 transition-colors">
                  <XIcon size={18} />
                </button>
              </div>
              <div className="bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 space-y-2">
                {displayTitle && (
                  <div>
                    <div className="text-[11px] text-white/40 mb-0.5">Title</div>
                    <div className="text-sm text-white/90">{displayTitle}</div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] text-white/40 mb-0.5">Link</div>
                  <div className="text-sm text-white/90 break-all">{typeof window !== 'undefined' ? `${window.location.origin}/${post.slug}` : `/${post.slug}`}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  const link = typeof window !== 'undefined' ? `${window.location.origin}/${post.slug}` : `/${post.slug}`
                  const text = displayTitle ? `${displayTitle}\n${link}` : link
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

      {/* Comments Panel */}
      <AnimatePresence>
        {showComments && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowComments(false); setReplyTo(null) }}
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
                  Comments {commentsCount > 0 ? `(${commentsCount})` : ''}
                </span>
                <button onClick={() => { setShowComments(false); setReplyTo(null) }} className="text-white/40 hover:text-white/70 transition-colors">
                  <XIcon size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-2">
                {comments.length === 0 ? (
                  <p className="text-white/30 text-sm text-center mt-8">No comments yet. Be the first.</p>
                ) : (
                  buildCommentThreads(comments).map((thread, idx) => (
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
                          onClick={() => setReplyTo({ id: thread.comment.id, content: thread.comment.content })}
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
                                  onClick={() => setReplyTo({ id: reply.id, content: reply.content })}
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
                {replyTo && (
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-white/35 text-xs">
                      Replying to: {replyTo.content.length > 30 ? replyTo.content.slice(0, 30) + '...' : replyTo.content}
                    </span>
                    <button onClick={() => setReplyTo(null)} className="text-white/30 hover:text-white/50 transition-colors">
                      <XIcon size={14} />
                    </button>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <input
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
                    placeholder={replyTo ? 'Write a reply...' : 'Write a comment...'}
                    className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
                  />
                  <button
                    onClick={submitComment}
                    disabled={submitting || !commentInput.trim()}
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
