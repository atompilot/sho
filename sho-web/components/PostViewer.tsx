'use client'

import { useState, useRef, useEffect, CSSProperties } from 'react'
import { ContentRenderer } from './ContentRenderer'

interface Post {
  slug: string
  content: string
  format: 'markdown' | 'html' | 'txt' | 'jsx'
  policy: string
  views: number
  created_at: string
}

const btnStyle = (x: number, y: number): CSSProperties => ({
  position: 'fixed',
  left: x,
  top: y,
  zIndex: 50,
  width: 48,
  height: 48,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'grab',
  userSelect: 'none',
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(8px)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.15)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
})

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

export function PostViewer({ post }: { post: Post }) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [mounted, setMounted] = useState(false)

  const dragging = useRef(false)
  const didDrag = useRef(false)
  const origin = useRef({ mouseX: 0, mouseY: 0, btnX: 0, btnY: 0 })

  useEffect(() => {
    setPos({ x: window.innerWidth - 72, y: window.innerHeight - 72 })
    setMounted(true)
  }, [])

  useEffect(() => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

    const onMove = (clientX: number, clientY: number) => {
      if (!dragging.current) return
      const dx = clientX - origin.current.mouseX
      const dy = clientY - origin.current.mouseY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag.current = true
      setPos({
        x: clamp(origin.current.btnX + dx, 8, window.innerWidth - 56),
        y: clamp(origin.current.btnY + dy, 8, window.innerHeight - 56),
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

  const handleClick = () => {
    if (!didDrag.current) setMode(m => (m === 'preview' ? 'source' : 'preview'))
  }

  return (
    <>
      <ContentRenderer content={post.content} format={post.format} mode={mode} />
      {mounted && (
        <button
          onMouseDown={(e) => { startDrag(e.clientX, e.clientY); e.preventDefault() }}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onClick={handleClick}
          title={mode === 'preview' ? 'View source' : 'View preview'}
          style={btnStyle(pos.x, pos.y)}
        >
          {mode === 'preview' ? <CodeIcon /> : <EyeIcon />}
        </button>
      )}
    </>
  )
}
