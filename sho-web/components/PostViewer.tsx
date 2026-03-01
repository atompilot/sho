'use client'

import { useState, useRef, useEffect, CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
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
  views: number
  likes: number
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
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.15)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  cursor: 'grab',
  userSelect: 'none',
})

const ActionBtn = ({
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
}) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 52,
      minHeight: 52,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      background: 'none',
      border: 'none',
      color: active ? '#f87171' : 'white',
      cursor: 'pointer',
      padding: '8px 0',
    }}
  >
    {icon}
    {count !== undefined && (
      <span style={{ fontSize: 10, lineHeight: 1, opacity: 0.85 }}>{count}</span>
    )}
  </button>
)

const Divider = () => (
  <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
)

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

const CommentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const CodeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
)

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EditIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9,22 9,12 15,12 15,22"/>
  </svg>
)

const LockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

const VIEW_POLICY_LABELS: Record<string, string> = {
  'password': 'Enter password to view',
  'human-qa': 'Answer the question to view',
  'ai-qa': 'Answer the question to view (AI judged)',
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
  const [editToast, setEditToast] = useState('')

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
          y: Math.min(y, window.innerHeight - 320),
        })
      } catch {
        setPos({ x: window.innerWidth - 72, y: window.innerHeight - 340 })
      }
    } else {
      setPos({ x: window.innerWidth - 72, y: window.innerHeight - 340 })
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
        y: clamp(origin.current.btnY + dy, 8, window.innerHeight - 320),
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

  const handleEditClick = () => {
    const p = post.policy
    if (p === 'locked') {
      setEditToast('This post is locked and cannot be edited')
      setTimeout(() => setEditToast(''), 1500)
      return
    }
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

  // Determine the content to render
  const displayContent = unlocked && unlockedContent ? unlockedContent : (post.content || '')
  const isLocked = needsUnlock && !unlocked

  return (
    <>
      {/* Content area with optional blur */}
      <div style={{ position: 'relative' }}>
        {isLocked ? (
          <>
            {/* Blurred preview background */}
            <div style={{ filter: 'blur(8px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.6 }}>
              <div style={{
                padding: '40px 20px',
                maxWidth: 800,
                margin: '0 auto',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 14,
                lineHeight: 1.8,
                color: '#666',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {post.preview || ''}
                {'\n\n...'}
              </div>
            </div>

            {/* Unlock overlay card */}
            <div style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 40,
              background: 'rgba(0,0,0,0.3)',
              backdropFilter: 'blur(2px)',
            }}>
              <div style={{
                background: 'white',
                borderRadius: 16,
                padding: '32px 28px',
                width: '100%',
                maxWidth: 380,
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}>
                <div style={{ marginBottom: 16, color: '#6b7280' }}>
                  <LockIcon />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#111' }}>
                  {VIEW_POLICY_LABELS[post.view_policy || ''] || 'Content Protected'}
                </h2>

                {(post.view_policy === 'human-qa' || post.view_policy === 'ai-qa') && post.view_qa_question && (
                  <p style={{
                    fontSize: 14, color: '#374151', marginBottom: 16,
                    background: '#f3f4f6', borderRadius: 8, padding: '10px 14px',
                    textAlign: 'left', lineHeight: 1.6,
                  }}>
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
                  style={{
                    width: '100%',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 14,
                    outline: 'none',
                    marginBottom: 12,
                    boxSizing: 'border-box',
                  }}
                />

                {verifyError && (
                  <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 10 }}>
                    {verifyError}
                  </p>
                )}

                <button
                  onClick={handleVerifyView}
                  disabled={verifying || !credential.trim()}
                  style={{
                    width: '100%',
                    background: credential.trim() ? '#111' : '#d1d5db',
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 0',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: credential.trim() ? 'pointer' : 'default',
                    opacity: verifying ? 0.6 : 1,
                    transition: 'background 0.2s',
                  }}
                >
                  {verifying ? 'Verifying...' : 'Unlock'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <ContentRenderer content={displayContent} format={post.format} mode={mode} />
        )}
      </div>

      {mounted && (
        <div
          data-fab
          style={panelStyle(pos.x, pos.y)}
          onMouseDown={(e) => { startDrag(e.clientX, e.clientY); e.preventDefault() }}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        >
          <ActionBtn
            icon={<EyeIcon />}
            count={views}
            title="浏览数"
          />
          <Divider />
          <ActionBtn
            icon={<HeartIcon filled={liked} />}
            count={likes}
            active={liked}
            title="点赞"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); handleLike() } }}
          />
          <Divider />
          <ActionBtn
            icon={<CommentIcon />}
            count={commentsCount}
            title="评论"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); openComments() } }}
          />
          <Divider />
          <ActionBtn
            icon={<EditIcon />}
            title="编辑"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); handleEditClick() } }}
          />
          <Divider />
          <ActionBtn
            icon={mode === 'preview' ? <CodeIcon /> : <EyeIcon />}
            title={mode === 'preview' ? '查看源码' : '查看预览'}
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); setMode(m => m === 'preview' ? 'source' : 'preview') } }}
          />
          <Divider />
          <ActionBtn
            icon={<HomeIcon />}
            title="返回主页"
            onClick={(e) => { if (!didDrag.current) { e.stopPropagation(); router.push('/') } }}
          />
        </div>
      )}

      {/* Toast for locked */}
      {editToast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', color: 'white', padding: '10px 20px',
          borderRadius: 10, fontSize: 13, zIndex: 70, backdropFilter: 'blur(8px)',
        }}>
          {editToast}
        </div>
      )}

      {showComments && (
        <>
          <div
            onClick={() => { setShowComments(false); setReplyTo(null) }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              zIndex: 59,
            }}
          />
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 480,
              height: 'min(60vh, 500px)',
              background: 'rgba(20,20,20,0.98)',
              backdropFilter: 'blur(16px)',
              borderRadius: '16px 16px 0 0',
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -4px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ color: 'white', fontSize: 15, fontWeight: 600 }}>评论 {commentsCount > 0 ? `(${commentsCount})` : ''}</span>
              <button
                onClick={() => { setShowComments(false); setReplyTo(null) }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 8px' }}>
              {comments.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginTop: 32 }}>还没有评论，来第一个吧</p>
              ) : (
                buildCommentThreads(comments).map(thread => (
                  <div key={thread.comment.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{thread.comment.content}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{timeAgo(thread.comment.created_at)}</span>
                      <button
                        onClick={() => setReplyTo({ id: thread.comment.id, content: thread.comment.content })}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11, padding: 0 }}
                      >
                        回复
                      </button>
                    </div>

                    {thread.replies.length > 0 && (
                      <div style={{ marginLeft: 20, marginTop: 8, borderLeft: '2px solid rgba(255,255,255,0.08)', paddingLeft: 12 }}>
                        {thread.replies.map(reply => (
                          <div key={reply.id} style={{ padding: '8px 0' }}>
                            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{reply.content}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3 }}>
                              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>{timeAgo(reply.created_at)}</span>
                              <button
                                onClick={() => setReplyTo({ id: reply.id, content: reply.content })}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 11, padding: 0 }}
                              >
                                回复
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '8px 20px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {replyTo && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 0', marginBottom: 6,
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    回复: {replyTo.content.length > 30 ? replyTo.content.slice(0, 30) + '…' : replyTo.content}
                  </span>
                  <button
                    onClick={() => setReplyTo(null)}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                  >
                    ×
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
                  placeholder={replyTo ? '写回复…' : '写评论…'}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 20,
                    padding: '9px 16px',
                    color: 'white',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={submitComment}
                  disabled={submitting || !commentInput.trim()}
                  style={{
                    background: commentInput.trim() ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: 20,
                    color: 'white',
                    padding: '9px 18px',
                    cursor: commentInput.trim() ? 'pointer' : 'default',
                    fontSize: 13,
                    fontWeight: 500,
                    opacity: submitting ? 0.5 : 1,
                    transition: 'background 0.2s',
                  }}
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
