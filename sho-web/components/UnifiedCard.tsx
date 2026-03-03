'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LockKeyIcon,
  CaretDownIcon,
  CaretUpIcon,
} from '@phosphor-icons/react'
import { ContentRenderer } from '@/components/ContentRenderer'
import { FormatBadge } from '@/components/ui/FormatBadge'
import { ActionPanel } from '@/components/ActionPanel'
import { usePostLike, usePostShare, handleDownload, timeAgo } from '@/hooks/usePostActions'
import type { Post } from '@/types/post'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

const IFRAME_FORMATS = ['html', 'jsx', 'svg', 'lottie', 'p5', 'reveal', 'glsl']

const VIEW_POLICY_LABELS: Record<string, string> = {
  'password': 'Enter password to view',
  'human-qa': 'Answer the question to view',
  'ai-qa': 'Answer the question to view (AI judged)',
}

interface UnifiedCardProps {
  post: Post
  isActive: boolean
  hasBeenActive: boolean
  sourceMode: boolean
  onToggleSource: () => void
  onOpenComments: () => void
  onOpenShare: () => void
  onExpandChange?: (expanded: boolean) => void
}

export function UnifiedCard({
  post,
  isActive,
  hasBeenActive,
  sourceMode,
  onToggleSource,
  onOpenComments,
  onOpenShare,
  onExpandChange,
}: UnifiedCardProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const [views, setViews] = useState(post.views ?? 0)
  const contentRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // View policy unlock state
  const needsUnlock = post.view_policy && post.view_policy !== 'open'
  const [unlocked, setUnlocked] = useState(false)
  const [unlockedContent, setUnlockedContent] = useState<string | null>(null)
  const [credential, setCredential] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const { likes, liked, handleLike } = usePostLike(post.slug, post.likes ?? 0)
  const { shares, handleShare: triggerShareApi } = usePostShare(post.slug, post.shares ?? 0)

  const isIframe = IFRAME_FORMATS.includes(post.format)
  const displayTitle = post.title || post.ai_title || ''

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

  // Record view when becoming active
  useEffect(() => {
    if (!isActive) return
    fetch(`${API_BASE}/api/v1/posts/${post.slug}/view`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.views != null) setViews(data.views) })
      .catch(() => {})
  }, [isActive, post.slug])

  const handleVerifyView = useCallback(async () => {
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
  }, [credential, verifying, post.slug])

  const handleShareClick = useCallback(() => {
    triggerShareApi()
    onOpenShare()
  }, [triggerShareApi, onOpenShare])

  const toggleExpand = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    onExpandChange?.(next)
    if (!next && cardRef.current) {
      cardRef.current.scrollIntoView({ block: 'start' })
    }
  }, [expanded, onExpandChange])

  const displayContent = unlocked && unlockedContent ? unlockedContent : (post.content || '')
  const isLocked = needsUnlock && !unlocked
  const hasContent = !!post.content

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
        {isLocked ? (
          <div className="flex flex-col items-center justify-center h-full text-white/60 gap-4 relative">
            {/* Blurred preview */}
            {(post.preview || post.content) && (
              <div className="absolute inset-0 blur-sm pointer-events-none select-none opacity-30">
                <div className="p-10 max-w-3xl mx-auto font-mono text-sm leading-relaxed text-slate-500 whitespace-pre-wrap break-words">
                  {post.preview || post.content}
                  {'\n\n...'}
                </div>
              </div>
            )}
            {/* Unlock overlay */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative z-10 rounded-2xl p-8 w-full max-w-sm text-center"
              style={{
                background: 'rgba(15,23,42,0.95)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
              }}
            >
              <div className="mb-4 text-white/40">
                <LockKeyIcon size={28} weight="light" className="mx-auto" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">
                {VIEW_POLICY_LABELS[post.view_policy || ''] || 'Content Protected'}
              </h2>

              {(post.view_policy === 'human-qa' || post.view_policy === 'ai-qa') && post.view_qa_question && (
                <p className="text-sm text-white/70 mb-4 bg-white/[0.06] rounded-xl p-3 text-left leading-relaxed">
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
                className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 mb-3 focus:outline-none focus:border-white/25 transition-all"
              />

              {verifyError && (
                <p className="text-sm text-red-400 mb-3">{verifyError}</p>
              )}

              <button
                onClick={handleVerifyView}
                disabled={verifying || !credential.trim()}
                className="w-full bg-white/[0.12] text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-30 disabled:cursor-default hover:bg-white/[0.18] transition-colors"
              >
                {verifying ? 'Verifying...' : 'Unlock'}
              </button>
            </motion.div>
          </div>
        ) : hasContent && hasBeenActive ? (
          <ContentRenderer
            content={displayContent}
            format={post.format as any}
            mode={sourceMode ? 'source' : 'feed'}
            slug={post.slug}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Action Panel */}
      <ActionPanel
        views={views}
        likes={likes}
        liked={liked}
        commentsCount={0}
        shares={shares}
        sourceMode={sourceMode}
        onLike={handleLike}
        onOpenComments={onOpenComments}
        onShare={handleShareClick}
        onEdit={() => router.push(`/edit/${post.slug}`)}
        onDownload={() => handleDownload(post)}
        onToggleSource={onToggleSource}
        visible={isActive}
      />

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
            {post.agent_name && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/50">
                <span style={{ color: 'rgba(251,146,60,0.9)' }}>&#9679;</span>
                {post.agent_name}
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
            <span>{views} views</span>
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
    </div>
  )
}
