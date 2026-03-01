'use client'

import { useState, useRef, useEffect, CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { ContentRenderer } from './ContentRenderer'

interface Post {
  slug: string
  content: string
  format: 'markdown' | 'html' | 'txt' | 'jsx'
  policy: string
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

  // Top-level: newest first; replies: oldest first (already ASC from API)
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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
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
  const [likes, setLikes] = useState(initialLikes ?? post.likes ?? 0)
  const [liked, setLiked] = useState(false)
  const [commentsCount, setCommentsCount] = useState(initialCommentsCount ?? 0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null)
  const [showEdit, setShowEdit] = useState<false | 'password' | 'editor'>(false)
  const [editContent, setEditContent] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editToast, setEditToast] = useState('')

  const dragging = useRef(false)
  const didDrag = useRef(false)
  const origin = useRef({ mouseX: 0, mouseY: 0, btnX: 0, btnY: 0 })

  useEffect(() => {
    setPos({ x: window.innerWidth - 72, y: window.innerHeight - 200 })
    setMounted(true)

    // 从 localStorage 恢复点赞状态
    if (localStorage.getItem(`liked:${post.slug}`) === '1') {
      setLiked(true)
    }

    // 从 API 获取最新点赞数（SSR 数据可能有缓存延迟）
    fetch(`${API_BASE}/api/v1/posts/${post.slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.likes != null) setLikes(data.likes) })
      .catch(() => {})

    // 从 API 获取最新评论数
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
        y: clamp(origin.current.btnY + dy, 8, window.innerHeight - 180),
      })
    }

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => onMove(e.touches[0].clientX, e.touches[0].clientY)
    const onUp = () => { dragging.current = false }

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
    if (p === 'owner-only') {
      setEditToast('This post can only be edited via the manage link')
      setTimeout(() => setEditToast(''), 1500)
      return
    }
    if (p === 'password') {
      setEditPassword('')
      setEditError('')
      setShowEdit('password')
      return
    }
    // open or ai-review: go straight to editor
    setEditContent(post.content)
    setEditError('')
    setShowEdit('editor')
  }

  const unlockWithPassword = () => {
    if (!editPassword.trim()) return
    setEditContent(post.content)
    setEditError('')
    setShowEdit('editor')
  }

  const submitEdit = async () => {
    if (editSaving) return
    setEditSaving(true)
    setEditError('')
    try {
      const credential = post.policy === 'password' ? editPassword : ''
      const res = await fetch(`${API_BASE}/api/v1/posts/${post.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent, credential }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to save' }))
        setEditError(data.error || `Error ${res.status}`)
        return
      }
      setShowEdit(false)
      window.location.reload()
    } catch {
      setEditError('Network error')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <>
      <ContentRenderer content={post.content} format={post.format} mode={mode} />

      {mounted && (
        <div
          style={panelStyle(pos.x, pos.y)}
          onMouseDown={(e) => { startDrag(e.clientX, e.clientY); e.preventDefault() }}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        >
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

      {/* Toast for locked / owner-only */}
      {editToast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', color: 'white', padding: '10px 20px',
          borderRadius: 10, fontSize: 13, zIndex: 70, backdropFilter: 'blur(8px)',
        }}>
          {editToast}
        </div>
      )}

      {/* Password unlock panel */}
      {showEdit === 'password' && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
          background: 'rgba(15,15,15,0.95)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <span style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>Enter password to edit</span>
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 360 }}>
            <input
              type="password"
              value={editPassword}
              onChange={e => setEditPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') unlockWithPassword() }}
              placeholder="Password"
              autoFocus
              style={{
                flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={unlockWithPassword}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                color: 'white', padding: '0 16px', cursor: 'pointer', fontSize: 13,
              }}
            >
              Unlock
            </button>
            <button
              onClick={() => setShowEdit(false)}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                color: 'rgba(255,255,255,0.6)', padding: '0 12px', cursor: 'pointer', fontSize: 13,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit panel */}
      {showEdit === 'editor' && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: 'min(60vh, 500px)', zIndex: 60,
          background: 'rgba(15,15,15,0.95)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>
              Edit
              {post.policy === 'ai-review' && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>
                  Your changes will be reviewed by AI before being applied
                </span>
              )}
            </span>
            <button
              onClick={() => setShowEdit(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
            >
              ×
            </button>
          </div>

          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            style={{
              flex: 1, margin: '8px 16px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              padding: 12, color: 'white', fontSize: 13, fontFamily: 'monospace',
              resize: 'none', outline: 'none',
            }}
          />

          {editError && (
            <p style={{ margin: '0 16px 4px', color: '#f87171', fontSize: 12 }}>{editError}</p>
          )}

          <div style={{ padding: '8px 16px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={() => setShowEdit(false)}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                color: 'rgba(255,255,255,0.6)', padding: '8px 16px', cursor: 'pointer', fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              onClick={submitEdit}
              disabled={editSaving}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                color: 'white', padding: '8px 20px', cursor: 'pointer', fontSize: 13,
                opacity: editSaving ? 0.5 : 1,
              }}
            >
              {editSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {showComments && (
        <>
          {/* Backdrop */}
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
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ color: 'white', fontSize: 15, fontWeight: 600 }}>评论 {commentsCount > 0 ? `(${commentsCount})` : ''}</span>
              <button
                onClick={() => { setShowComments(false); setReplyTo(null) }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>

            {/* Comment threads */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 8px' }}>
              {comments.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginTop: 32 }}>还没有评论，来第一个吧</p>
              ) : (
                buildCommentThreads(comments).map(thread => (
                  <div key={thread.comment.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Level 1 comment */}
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

                    {/* Level 2 replies */}
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

            {/* Input area */}
            <div style={{ padding: '8px 20px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {/* Reply indicator */}
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
