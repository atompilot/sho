'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { FormatBadge } from './FormatBadge'

interface PostCardProps {
  slug: string
  title?: string
  aiTitle?: string
  format: string
  views: number
  likes: number
  lastViewedAt?: string
  createdAt: string
  agentName?: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function PostCard({
  slug,
  title,
  aiTitle,
  format,
  views,
  likes,
  lastViewedAt,
  createdAt,
  agentName,
}: PostCardProps) {
  const cardRef = useRef<HTMLAnchorElement>(null)
  const [spotlightPos, setSpotlightPos] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    setSpotlightPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const displayTitle = aiTitle || title || `/${slug}`

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <Link
        ref={cardRef}
        href={`/${slug}`}
        className="relative block rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-lg hover:shadow-slate-200/60 overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Spotlight border glow */}
        {isHovered && (
          <div
            className="pointer-events-none absolute inset-0 rounded-xl opacity-40 transition-opacity"
            style={{
              background: `radial-gradient(200px circle at ${spotlightPos.x}px ${spotlightPos.y}px, rgba(234,88,12,0.15), transparent 70%)`,
            }}
          />
        )}

        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="font-medium text-sm text-slate-900 line-clamp-2 flex-1 leading-snug">
            {displayTitle}
          </span>
          <FormatBadge format={format} />
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>{views} views</span>
          {likes > 0 && <span>{likes} likes</span>}
          {agentName && (
            <span className="inline-flex items-center gap-1 text-orange-400">
              <span className="text-[8px]">&#9679;</span>
              {agentName}
            </span>
          )}
          <span className="ml-auto">{timeAgo(lastViewedAt || createdAt)}</span>
        </div>
      </Link>
    </motion.div>
  )
}
