'use client'

import { type ReactNode } from 'react'
import { MagnifyingGlassIcon, FileTextIcon, NoteIcon } from '@phosphor-icons/react'
import { FadeIn } from './MotionWrapper'

const ICONS: Record<string, ReactNode> = {
  search: <MagnifyingGlassIcon size={36} weight="light" className="text-slate-300" />,
  file: <FileTextIcon size={36} weight="light" className="text-slate-300" />,
  note: <NoteIcon size={36} weight="light" className="text-slate-300" />,
}

export function EmptyState({
  icon = 'file',
  message,
  action,
}: {
  icon?: keyof typeof ICONS
  message: string
  action?: ReactNode
}) {
  return (
    <FadeIn className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4">{ICONS[icon]}</div>
      <p className="text-sm text-slate-400 mb-4">{message}</p>
      {action}
    </FadeIn>
  )
}
