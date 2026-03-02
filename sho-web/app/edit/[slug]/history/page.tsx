'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretDownIcon } from '@phosphor-icons/react'
import { StaggerContainer, StaggerItem, FadeIn } from '@/components/ui/MotionWrapper'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

interface PostVersion {
  id: string
  post_id: string
  content: string
  edited_by: string | null
  created_at: string
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

export default function EditHistoryPage() {
  const params = useParams()
  const slug = params.slug as string

  const [versions, setVersions] = useState<PostVersion[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/posts/${slug}/versions?limit=50`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load')
        return r.json()
      })
      .then(data => {
        setVersions(data.versions || [])
        setTotal(data.total || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-white">
        <div className="skeleton h-4 w-24" />
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center px-4 py-16 bg-white">
      <StaggerContainer className="w-full max-w-2xl">
        <StaggerItem>
          <div className="flex items-center gap-4 text-sm text-slate-400 mb-4">
            <Link href={`/${slug}`} className="hover:text-slate-600 transition-colors">View post</Link>
            <span className="text-slate-200">|</span>
            <Link href={`/edit/${slug}`} className="hover:text-slate-600 transition-colors">Back to editor</Link>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
            Edit History <span className="text-slate-400">/{slug}</span>
          </h1>
          <p className="text-sm text-slate-400 mb-8">
            {total} {total === 1 ? 'version' : 'versions'}
          </p>
        </StaggerItem>

        {versions.length === 0 ? (
          <FadeIn className="text-center py-16">
            <p className="text-slate-400 text-sm">No edit history yet</p>
          </FadeIn>
        ) : (
          <div className="space-y-3">
            {versions.map((v, idx) => (
              <StaggerItem key={v.id}>
                <div className="border border-slate-200 rounded-xl overflow-hidden transition-all hover:border-slate-300">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                    className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Timeline dot */}
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        idx === 0 ? 'bg-slate-800' : 'bg-slate-300'
                      }`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900" title={formatDate(v.created_at)}>
                            {timeAgo(v.created_at)}
                          </span>
                          {idx === 0 && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                              Latest
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {v.edited_by || 'anonymous'}
                          {' · '}
                          {v.content.length.toLocaleString()} chars
                        </p>
                      </div>
                    </div>
                    <motion.div
                      animate={{ rotate: expandedId === v.id ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CaretDownIcon size={16} className="text-slate-400" />
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {expandedId === v.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                          <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words max-h-96 overflow-auto leading-relaxed">
                            {v.content}
                          </pre>
                          <p className="text-xs text-slate-400 mt-3">{formatDate(v.created_at)}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </StaggerItem>
            ))}
          </div>
        )}
      </StaggerContainer>
    </main>
  )
}
