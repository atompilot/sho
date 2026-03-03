'use client'

import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  EyeIcon,
  HeartIcon,
  ShareNetworkIcon,
  ChatCircleIcon,
  PencilSimpleIcon,
  CodeIcon,
  HouseIcon,
  LockKeyIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
} from '@phosphor-icons/react'
import { ContentRenderer } from './ContentRenderer'

interface Post {
  slug: string
  title?: string
  ai_title?: string
  content?: string
  preview?: string
  format: 'markdown' | 'html' | 'txt' | 'jsx' | 'svg' | 'csv' | 'json' | 'lottie' | 'p5' | 'reveal' | 'glsl'
  policy: string
  view_policy?: 'open' | 'password' | 'human-qa' | 'ai-qa'
  view_qa_question?: string
  agent_id?: string
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

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

  return topLevel.map(c => ({
    comment: c,
    replies: childMap.get(c.id) || [],
  }))
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

const VIEW_POLICY_LABELS: Record<string, string> = {
  'password': 'Enter password to view',
  'human-qa': 'Answer the question to view',
  'ai-qa': 'Answer the question to view (AI judged)',
}

const panelStyle = (x: number, y: number): CSSProperties => ({
  position: 'fixed',
  left: x,
  top: y,
  zIndex: 50,
  width: 52,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 16,
  overflow: 'hidden',
  background: 'rgba(15,23,42,0.7)',
  backdropFilter: 'blur(16px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
  cursor: 'grab',
  userSelect: 'none',
})

function ActionBtn({
  icon,
  count,
  onClick,
  title,
  active,
}: {
  icon: React.ReactNode
  count?: number
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  title?: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-[52px] min-h-[52px] flex flex-col items-center justify-center gap-0.5 bg-transparent border-none cursor-pointer py-2 transition-colors duration-150"
      style={{ color: active ? '#f87171' : 'rgba(255,255,255,0.85)' }}
    >
      {icon}
      {count !== undefined && (
        <span className="text-[10px] leading-none opacity-80">{count}</span>
      )}
    </button>
  )
}

function Divider() {
  return <div className="h-px mx-2" style={{ background: 'rgba(255,255,255,0.08)' }} />
}

export function PostViewer({ post, initialLikes, initialCommentsCount }: {
  post: Post
  initialLikes?: number
  initialCommentsCount?: number
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [mounted, setMounted] = useState(false)
  const [views, setViews] = useState(post.views ?? 0)
  const [likes, setLikes] = useState(initialLikes ?? post.likes ?? 0)
  const [liked, setLiked] = useState(false)
  const [commentsCount, setCommentsCount] = useState(initialCommentsCount ?? 0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null)
  const [shares, setShares] = useState(post.shares ?? 0)
  const [showShare, setShowShare] = useState(false)
  const [shareCopied, setShareCopied] = useState('')

  // View policy unlock state
  const needsUnlock = post.view_policy && post.view_policy !== 'open'
  const [unlocked, setUnlocked] = useState(false)
  const [unlockedContent, setUnlockedContent] = useState<string | null>(null)
  const [credential, setCredential] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const dragging = useRef(false)
  const didDrag = useRef(false)
  const origin = useRef({ mouseX: 0, mouseY: 0, btnX: 0, btnY: 0 })

  // Check sessionStorage for previous unlock
  useEffect(() => {
    if (needsUnlock) {
      const cached = sessionStorage.getItem(`unlocked:${post.slug}`)
      if (cached) {
        setUnlocked(true)
        setUnlockedContent(cached)
      }
    }
  }, [needsUnlock, post.slug])

  useEffect(() => {
    const saved = localStorage.getItem('sho:fab-pos')
    if (saved) {
      try {
        const { x, y } = JSON.parse(saved)
        setPos({
          x: Math.min(x, window.innerWidth - 60),
          y: Math.min(y, window.innerHeight - 420),
        })
      } catch {
        setPos({ x: window.innerWidth - 72, y: window.innerHeight - 440 })
      }
    } else {
      setPos({ x: window.innerWidth - 72, y: window.innerHeight - 440 })
    }
    setMounted(true)

    if (localStorage.getItem(`liked:${post.slug}`) === '1') {
      setLiked(true)
    }

    fetch(`${API_BASE}/api/v1/posts/${post.slug}/view`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.views != null) setViews(data.views) })
      .catch(() => {})

    fetch(`${API_BASE}/api/v1/posts/${post.slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.likes != null) setLikes(data.likes)
        if (data?.views != null) setViews(data.views)
        if (data?.shares != null) setShares(data.shares)
      })
      .catch(() => {})

    fetch(`${API_BASE}/api/v1/posts/${post.slug}/comments`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data)) setCommentsCount(data.length) })
      .catch(() => {})
  }, [post.slug])

  useEffect(() => {
    const el = document.documentElement
    const prev = el.style.overflow
    el.style.overflow = 'hidden'
    return () => { el.style.overflow = prev }
  }, [mode])

  useEffect(() => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

    const onMove = (clientX: number, clientY: number) => {
      if (!dragging.current) return
      const dx = clientX - origin.current.mouseX
      const dy = clientY - origin.current.mouseY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag.current = true
      setPos({
        x: clamp(origin.current.btnX + dx, 8, window.innerWidth - 60),
        y: clamp(origin.current.btnY + dy, 8, window.innerHeight - 420),
      })
    }

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => onMove(e.touches[0].clientX, e.touches[0].clientY)
    const onUp = () => {
      if (dragging.current && didDrag.current) {
        const el = document.querySelector('[data-fab]') as HTMLElement | null
        if (el) {
          localStorage.setItem('sho:fab-pos', JSON.stringify({
            x: parseInt(el.style.left),
            y: parseInt(el.style.top),
          }))
        }
      }
      dragging.current = false
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  const startDrag = (clientX: number, clientY: number) => {
    dragging.current = true
    didDrag.current = false
    origin.current = { mouseX: clientX, mouseY: clientY, btnX: pos.x, btnY: pos.y }
  }

  const handleLike = async () => {
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
  }

  const openComments = async () => {
    setShowComments(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${post.slug}/comments`)
      if (res.ok) {
        const data: Comment[] = await res.json()
        setComments(data)
        setCommentsCount(data.length)
      }
    } catch {
      // ignore
    }
  }

  const submitComment = async () => {
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
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  const [shared, setShared] = useState(false)
  const handleShare = async () => {
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
  }

  const handleShareCopy = (label: string, value: string) => {
    navigator.clipboard.writeText(value)
    setShareCopied(label)
    setTimeout(() => setShareCopied(''), 1500)
  }

  const handleEditClick = () => {
    router.push(`/edit/${post.slug}`)
  }

  const handleVerifyView = async () => {
    if (!credential.trim() || verifying) return
    setVerifying(true)
    setVerifyError('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${post.slug}/verify-view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credential.trim() }),
      })
      const data = await res.json()
      if (data.granted && data.content) {
        setUnlocked(true)
        setUnlockedContent(data.content)
        sessionStorage.setItem(`unlocked:${post.slug}`, data.content)
      } else {
        setVerifyError(data.error || 'Verification failed')
      }
    } catch {
      setVerifyError('Network error')
    } finally {
      setVerifying(false)
    }
  }

  const displayContent = unlocked && unlockedContent ? unlockedContent : (post.content || '')
  const isLocked = needsUnlock && !unlocked

  return (
    <>
      {/* Content area */}
      <div className="relative">
        {isLocked ? (
          <>
            {/* Blurred preview */}
            <div className="blur-sm pointer-events-none select-none opacity-60">
              <div className="p-10 max-w-3xl mx-auto font-mono text-sm leading-relaxed text-slate-500 whitespace-pre-wrap break-words">
                {post.preview || ''}
                {'\n\n...'}
              </div>
            </div>

            {/* Unlock overlay */}
            <div className="fixed inset-0 flex items-center justify-center z-40 bg-slate-950/30 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center"
              >
                <div className="mb-4 text-slate-400">
                  <LockKeyIcon size={28} weight="light" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 mb-2">
                  {VIEW_POLICY_LABELS[post.view_policy || ''] || 'Content Protected'}
                </h2>

                {(post.view_policy === 'human-qa' || post.view_policy === 'ai-qa') && post.view_qa_question && (
                  <p className="text-sm text-slate-600 mb-4 bg-slate-50 rounded-xl p-3 text-left leading-relaxed">
                    {post.view_qa_question}
                  </p>
                )}

                <input
                  type={post.view_policy === 'password' ? 'password' : 'text'}
                  value={credential}
                  onChange={e => setCredential(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleVerifyView() }}
                  placeholder={post.view_policy === 'password' ? 'Enter password' : 'Your answer'}
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />

                {verifyError && (
                  <p className="text-sm text-red-500 mb-3">{verifyError}</p>
                )}

                <button
                  onClick={handleVerifyView}
                  disabled={verifying || !credential.trim()}
                  className="w-full bg-slate-800 text-white rounded-xl py-2.5 text-sm font-medium disabled:bg-slate-300 disabled:cursor-default hover:bg-slate-900 transition-colors"
                >
                  {verifying ? 'Verifying...' : 'Unlock'}
                </button>
              </motion.div>
            </div>
          </>
        ) : (
          <ContentRenderer content={displayContent} format={post.format} mode={mode} />
        )}
      </div>

      {/* Agent badge */}
      {mounted && post.agent_name && (
        <div className="fixed bottom-4 left-4 z-40">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
            style={{
              background: 'rgba(15,23,42,0.6)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span style={{ color: 'rgba(251,146,60,0.9)' }}>&#9679;</span>
            Published by {post.agent_name}
          </div>
        </div>
      )}

      {/* FAB */}
      {mounted && (
        <motion.div
          data-fab
          style={panelStyle(pos.x, pos.y)}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.3 }}
          onMouseDown={(e) => { startDrag(e.clientX, e.clientY); e.preventDefault() }}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        >
          <ActionBtn
            icon={<EyeIcon size={18} weight="regular" />}
            count={views}
            title="Views"
          />
          <Divider />
          <ActionBtn
            icon={<HeartIcon size={18} weight={liked ? 'fill' : 'regular'} />}
            count={likes}
            active={liked}
            title="Like"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); handleLike() } }}
          />
          <Divider />
          <ActionBtn
            icon={<ShareNetworkIcon size={18} weight="regular" />}
            count={shares}
            title="Share"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); handleShare() } }}
          />
          <Divider />
          <ActionBtn
            icon={<ChatCircleIcon size={18} weight="regular" />}
            count={commentsCount}
            title="Comments"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); openComments() } }}
          />
          <Divider />
          <ActionBtn
            icon={<PencilSimpleIcon size={18} weight="regular" />}
            title="Edit"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); handleEditClick() } }}
          />
          <Divider />
          <ActionBtn
            icon={mode === 'preview' ? <CodeIcon size={18} weight="regular" /> : <EyeIcon size={18} weight="regular" />}
            title={mode === 'preview' ? 'View source' : 'View preview'}
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); setMode(m => m === 'preview' ? 'source' : 'preview') } }}
          />
          <Divider />
          <ActionBtn
            icon={<HouseIcon size={18} weight="regular" />}
            title="Home"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); router.push('/') } }}
          />
        </motion.div>
      )}

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
                <button
                  onClick={() => setShowShare(false)}
                  className="text-white/40 hover:text-white/70 transition-colors"
                >
                  <XIcon size={18} />
                </button>
              </div>

              <div className="bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 space-y-2">
                {(post.title || post.ai_title) && (
                  <div>
                    <div className="text-[11px] text-white/40 mb-0.5">Title</div>
                    <div className="text-sm text-white/90">{post.title || post.ai_title}</div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] text-white/40 mb-0.5">Link</div>
                  <div className="text-sm text-white/90 break-all">{typeof window !== 'undefined' ? `${window.location.origin}/${post.slug}` : `/${post.slug}`}</div>
                </div>
              </div>

              <button
                onClick={() => {
                  const title = post.title || post.ai_title
                  const link = typeof window !== 'undefined' ? `${window.location.origin}/${post.slug}` : `/${post.slug}`
                  const text = title ? `${title}\n${link}` : link
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
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                <span className="text-white text-sm font-semibold">
                  Comments {commentsCount > 0 ? `(${commentsCount})` : ''}
                </span>
                <button
                  onClick={() => { setShowComments(false); setReplyTo(null) }}
                  className="text-white/40 hover:text-white/70 transition-colors"
                >
                  <XIcon size={18} />
                </button>
              </div>

              {/* Comments list */}
              <div className="flex-1 overflow-y-auto px-5 py-2">
                {comments.length === 0 ? (
                  <p className="text-white/30 text-sm text-center mt-8">
                    No comments yet. Be the first.
                  </p>
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

              {/* Comment input */}
              <div className="px-5 py-3 border-t border-white/[0.06]">
                {replyTo && (
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-white/35 text-xs">
                      Replying to: {replyTo.content.length > 30 ? replyTo.content.slice(0, 30) + '...' : replyTo.content}
                    </span>
                    <button
                      onClick={() => setReplyTo(null)}
                      className="text-white/30 hover:text-white/50 transition-colors"
                    >
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
    </>
  )
}
