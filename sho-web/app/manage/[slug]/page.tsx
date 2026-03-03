'use client'

import { Suspense, useEffect, useState, use } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'
const STORAGE_KEY = 'sho:master-password'

type AuthState = 'checking' | 'needPassword' | 'authenticated'

interface ManageContentProps {
  slug: string
}

function ManageContent({ slug }: ManageContentProps) {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [masterPassword, setMasterPassword] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // On mount: verify cached master password
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (!cached) {
      setAuthState('needPassword')
      return
    }
    verifyPassword(cached)
  }, [])

  async function verifyPassword(pw: string) {
    setAuthState('checking')
    setAuthError('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/verify-master`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json()
      if (data.valid) {
        setMasterPassword(pw)
        localStorage.setItem(STORAGE_KEY, pw)
        setAuthState('authenticated')
      } else {
        localStorage.removeItem(STORAGE_KEY)
        setAuthState('needPassword')
        setAuthError('Invalid password')
      }
    } catch {
      setAuthState('needPassword')
      setAuthError('Network error')
    }
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!passwordInput.trim()) return
    verifyPassword(passwordInput.trim())
  }

  // Load post content after authenticated
  useEffect(() => {
    if (authState !== 'authenticated') return
    fetch(`${API_BASE}/api/v1/posts/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load post: ${r.status}`)
        return r.json()
      })
      .then((d) => {
        setContent(d.content || '')
        setLoading(false)
      })
      .catch((e) => {
        setMsg(e.message || 'Failed to load post')
        setLoading(false)
      })
  }, [authState, slug])

  async function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, credential: masterPassword }),
      })
      const data = await res.json()
      setMsg(res.ok ? 'Saved!' : data.error || 'Save failed')
    } catch {
      setMsg('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this Sho?')) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/posts/${slug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: masterPassword }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Delete failed' }))
        setMsg(data.error || `Delete failed: ${res.status}`)
        return
      }
      window.location.href = '/'
    } catch {
      setMsg('Network error during delete')
    }
  }

  // Password prompt
  if (authState === 'checking') {
    return <div className="p-12 text-gray-500">Verifying...</div>
  }

  if (authState === 'needPassword') {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <form onSubmit={handlePasswordSubmit} className="w-full max-w-sm p-8">
          <h1 className="text-xl font-bold mb-6 text-center">Enter Master Password</h1>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Master password"
            autoFocus
            className="w-full border rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-black/20"
          />
          {authError && <p className="text-sm text-red-500 mb-3">{authError}</p>}
          <button
            type="submit"
            disabled={!passwordInput.trim()}
            className="w-full bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            Verify
          </button>
        </form>
      </main>
    )
  }

  // Authenticated — show editor
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
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  return (
    <Suspense fallback={<div className="p-12 text-gray-500">Loading...</div>}>
      <ManageContent slug={slug} />
    </Suspense>
  )
}
