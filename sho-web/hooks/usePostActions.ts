'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Post, Comment, CommentThread } from '@/types/post'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function buildCommentThreads(comments: Comment[]): CommentThread[] {
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

export function usePostLike(slug: string, initialLikes: number) {
  const [likes, setLikes] = useState(initialLikes)
  const [liked, setLiked] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(`liked:${slug}`) === '1') setLiked(true)
  }, [slug])

  const handleLike = useCallback(async () => {
    if (liked) return
    const prev = likes
    setLikes(l => l + 1)
    setLiked(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${slug}/like`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setLikes(data.likes)
        localStorage.setItem(`liked:${slug}`, '1')
      } else {
        setLikes(prev); setLiked(false)
      }
    } catch {
      setLikes(prev); setLiked(false)
    }
  }, [liked, likes, slug])

  return { likes, liked, handleLike }
}

export function usePostShare(slug: string, initialShares: number) {
  const [shares, setShares] = useState(initialShares)
  const [shared, setShared] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareCopied, setShareCopied] = useState('')

  const handleShare = useCallback(async () => {
    setShowShare(true)
    if (shared) return
    const prev = shares
    setShares(s => s + 1)
    setShared(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${slug}/share`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setShares(data.shares)
      } else {
        setShares(prev); setShared(false)
      }
    } catch {
      setShares(prev); setShared(false)
    }
  }, [shared, shares, slug])

  const handleShareCopy = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value)
    setShareCopied(label)
    setTimeout(() => setShareCopied(''), 1500)
  }, [])

  return { shares, showShare, setShowShare, shareCopied, handleShare, handleShareCopy }
}

export function usePostComments(slug: string) {
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsCount, setCommentsCount] = useState(0)
  const [showComments, setShowComments] = useState(false)
  const [commentInput, setCommentInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null)

  const openComments = useCallback(async () => {
    setShowComments(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${slug}/comments`)
      if (res.ok) {
        const data: Comment[] = await res.json()
        setComments(data)
        setCommentsCount(data.length)
      }
    } catch { /* ignore */ }
  }, [slug])

  const submitComment = useCallback(async () => {
    if (!commentInput.trim() || submitting) return
    setSubmitting(true)
    try {
      const body: Record<string, string> = { content: commentInput.trim() }
      if (replyTo) body.parent_id = replyTo.id
      const res = await fetch(`${API_BASE}/api/v1/posts/${slug}/comments`, {
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
  }, [commentInput, submitting, replyTo, slug])

  return {
    comments, commentsCount, showComments, setShowComments,
    commentInput, setCommentInput, submitting, replyTo, setReplyTo,
    openComments, submitComment,
  }
}

export function handleDownload(post: Post) {
  const content = post.content
  if (!content) return
  const title = post.title || post.ai_title || post.slug
  const extMap: Record<string, string> = {
    markdown: '.md', html: '.html', txt: '.txt', jsx: '.jsx', svg: '.svg',
    csv: '.csv', json: '.json', lottie: '.json', p5: '.js', reveal: '.md',
    glsl: '.glsl', image: '',
  }
  if (post.format === 'image' && content.startsWith('data:')) {
    const a = document.createElement('a')
    a.href = content
    const mimeMatch = content.match(/^data:image\/(\w+)/)
    const imgExt = mimeMatch ? `.${mimeMatch[1].replace('jpeg', 'jpg')}` : '.png'
    a.download = `${title}${imgExt}`
    a.click()
    return
  }
  const ext = extMap[post.format] || '.txt'
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title}${ext}`
  a.click()
  URL.revokeObjectURL(url)
}
