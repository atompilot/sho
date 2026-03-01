'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ContentRenderer } from '../../components/ContentRenderer'
import { detectFormat, DetectableFormat } from '../../lib/detectFormat'

export default function PreviewPage() {
  const router = useRouter()
  const [content, setContent] = useState<string | null>(null)
  const [format, setFormat] = useState<DetectableFormat>('markdown')

  useEffect(() => {
    const c = sessionStorage.getItem('preview_content') ?? ''
    const f = sessionStorage.getItem('preview_format') ?? 'auto'
    setContent(c)
    setFormat(f === 'auto' ? detectFormat(c) : f as DetectableFormat)
  }, [])

  if (content === null) return null

  return (
    <>
      <ContentRenderer content={content} format={format} mode="preview" />
      <button
        onClick={() => router.back()}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 50,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        ← Back
      </button>
    </>
  )
}
