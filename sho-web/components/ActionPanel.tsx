'use client'

import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  EyeIcon,
  HeartIcon,
  ChatCircleIcon,
  ShareNetworkIcon,
  PencilSimpleIcon,
  DownloadSimpleIcon,
  CodeIcon,
} from '@phosphor-icons/react'

function ActionBtn({
  icon,
  count,
  onClick,
  active,
}: {
  icon: ReactNode
  count?: number
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-12 min-h-[48px] flex flex-col items-center justify-center gap-0.5 bg-transparent border-none cursor-pointer py-2 transition-colors duration-150"
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

interface ActionPanelProps {
  views: number
  likes: number
  liked: boolean
  commentsCount: number
  shares: number
  sourceMode: boolean
  onLike: () => void
  onOpenComments: () => void
  onShare: () => void
  onEdit: () => void
  onDownload: () => void
  onToggleSource: () => void
  visible: boolean
}

export function ActionPanel({
  views, likes, liked, commentsCount, shares, sourceMode,
  onLike, onOpenComments, onShare, onEdit, onDownload, onToggleSource,
  visible,
}: ActionPanelProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="absolute right-3 bottom-48 z-10 flex flex-col items-center rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(15,23,42,0.7)',
            backdropFilter: 'blur(16px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.6)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <ActionBtn icon={<EyeIcon size={20} weight="regular" />} count={views} />
          <Divider />
          <ActionBtn icon={<HeartIcon size={20} weight={liked ? 'fill' : 'regular'} />} count={likes} active={liked} onClick={onLike} />
          <Divider />
          <ActionBtn icon={<ChatCircleIcon size={20} weight="regular" />} count={commentsCount || undefined} onClick={onOpenComments} />
          <Divider />
          <ActionBtn icon={<ShareNetworkIcon size={20} weight="regular" />} count={shares || undefined} onClick={onShare} />
          <Divider />
          <ActionBtn icon={<PencilSimpleIcon size={20} weight="regular" />} onClick={onEdit} />
          <Divider />
          <ActionBtn icon={<DownloadSimpleIcon size={20} weight="regular" />} onClick={onDownload} />
          <Divider />
          <ActionBtn
            icon={sourceMode ? <EyeIcon size={20} weight="regular" /> : <CodeIcon size={20} weight="regular" />}
            active={sourceMode}
            onClick={onToggleSource}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
