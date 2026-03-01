'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

interface Post {
  id: string
  slug: string
  title?: string
  ai_title?: string
  content: string
  format: string
  policy: string
  views: number
  likes: number
  last_viewed_at?: string
  created_at: string
}

const MAX_CONTENT_BYTES = 1024 * 1024 // 1 MB

function byteLength(str: string): number {
  return new Blob([str]).size
}

export default function HomeClient({ posts }: { posts: Post[] }) {
  const [content, setContent] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [overLimit, setOverLimit] = useState(false)
  const router = useRouter()

  function updateContent(text: string) {
    if (byteLength(text) > MAX_CONTENT_BYTES) {
      setOverLimit(true)
      return
    }
    setOverLimit(false)
    setContent(text)
  }

  async function loadFile(file: File) {
    const text = await file.text()
    updateContent(text)
  }

  const handleContinue = useCallback(() => {
    if (!content.trim()) return
    const draftKey = `sho_draft_${crypto.randomUUID()}`
    localStorage.setItem(draftKey, content)
    router.push(`/new?draft=${draftKey}`)
  }, [content, router])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleContinue()
      }
    },
    [handleContinue]
  )

  return (
    <main className="min-h-screen flex flex-col items-center px-6 bg-white">

      {/* Hero */}
      <div className="flex flex-col items-center w-full max-w-lg pt-28 pb-12">

        {/* Brand mark */}
        <a
          href="https://splaz.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 mb-5 animate-fade-up hover:opacity-80 transition-opacity"
        >
          <Image
            src="/logo.png"
            alt="Sho"
            width={32}
            height={32}
            className="rounded-lg"
            priority
          />
          <span className="text-xl font-semibold tracking-tight text-gray-900">Sho</span>
        </a>

        {/* Slogan */}
        <h1
          className="text-5xl font-black text-[#111827] tracking-tight text-center mb-2 animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
          Publish anything.
        </h1>
        <p
          className="text-lg font-medium text-[#F97316] mb-10 text-center animate-fade-up"
          style={{ animationDelay: '0.2s' }}
        >
          No login required.
        </p>

        {/* Input */}
        <div
          className={`w-full transition-all animate-fade-up ${isDragOver ? 'ring-2 ring-blue-300 rounded-2xl' : ''}`}
          style={{ animationDelay: '0.3s' }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) loadFile(file)
          }}
        >
          <textarea
            placeholder="What would you like to share?"
            value={content}
            onChange={(e) => updateContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              const file = e.clipboardData.files[0]
              if (file) {
                e.preventDefault()
                loadFile(file)
              }
            }}
            rows={6}
            className="w-full border border-gray-200 rounded-2xl px-5 py-4 text-base font-mono resize-none focus:outline-none focus:ring-[3px] focus:ring-[#1E293B]/[0.08] focus:border-[#1E293B] hover:border-[#64748B] transition-all placeholder:text-gray-300 leading-relaxed"
            autoFocus
          />
          {overLimit && (
            <p className="text-xs text-red-500 mt-2">Content exceeds 1 MB limit.</p>
          )}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-300 select-none">
              {content.trim() ? '⌘ Return to continue' : ''}
            </span>
            <button
              onClick={handleContinue}
              disabled={!content.trim() || overLimit}
              className="bg-[#1E293B] text-white rounded-xl px-6 py-2.5 text-sm font-medium disabled:opacity-20 hover:bg-[#0F172A] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)] active:translate-y-0 active:shadow-none transition-all duration-200"
            >
              Continue →
            </button>
          </div>
        </div>
      </div>

      {/* Recommended — pill chips */}
      {posts.length > 0 && (
        <div className="w-full max-w-2xl pb-20">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">
              Trending
            </span>
            <Link
              href="/explore"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Explore →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {posts.slice(0, 9).map((post, i) => (
              <Link
                key={post.id}
                href={`/${post.slug}`}
                className="inline-block bg-gray-100 border border-transparent hover:border-[#F97316] hover:text-[#F97316] hover:bg-white text-gray-700 text-sm rounded-2xl px-4 py-2 transition-all duration-200 max-w-[240px] truncate animate-fade-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {post.ai_title || post.title || `/${post.slug}`}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* AI hint */}
      <div className="w-full max-w-2xl text-center pb-8">
        <a
          href="/skill.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-gray-500 transition-colors"
        >
          <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5 font-medium uppercase tracking-wider">AI</span>
          Agents can publish via API & MCP
        </a>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-2xl py-8 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          © 2026 Sho by Splat AI INC.
        </p>
        <a
          href="https://splaz.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
        >
          splaz.app →
        </a>
      </footer>

    </main>
  )
}
