'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface ManageContentProps {
  slug: string
}

function ManageContent({ slug }: ManageContentProps) {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/posts/${slug}`
    )
      .then((r) => r.json())
      .then((d) => {
        setContent(d.content)
        setLoading(false)
      })
  }, [slug])

  async function handleSave() {
    setSaving(true)
    setMsg('')
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/posts/${slug}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, credential: token }),
      }
    )
    const data = await res.json()
    setMsg(res.ok ? 'Saved!' : data.error)
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this Sho?')) return
    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/posts/${slug}?token=${token}`,
      { method: 'DELETE' }
    )
    window.location.href = '/'
  }

  if (loading) return <div className="p-12 text-gray-500">Loading...</div>

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Manage: /{slug}</h1>
        <button
          onClick={handleDelete}
          className="text-red-500 text-sm hover:underline"
        >
          Delete
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={16}
        className="w-full border rounded px-3 py-2 text-sm font-mono mb-4"
      />
      {msg && <p className="text-sm mb-2 text-gray-600">{msg}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-black text-white rounded px-6 py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </main>
  )
}

export default function ManagePage({
  params,
}: {
  params: { slug: string }
}) {
  return (
    <Suspense fallback={<div className="p-12 text-gray-500">Loading...</div>}>
      <ManageContent slug={params.slug} />
    </Suspense>
  )
}
