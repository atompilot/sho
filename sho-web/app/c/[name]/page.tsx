'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { StaggerContainer, StaggerItem } from '@/components/ui/MotionWrapper'
import { PostCard } from '@/components/ui/PostCard'
import { SkeletonGrid } from '@/components/ui/SkeletonCard'
import { EmptyState } from '@/components/ui/EmptyState'

interface Channel {
  id: string
  name: string
  display_name?: string
  description?: string
  agent_id?: string
  created_at: string
}

interface Post {
  id: string
  slug: string
  title?: string
  ai_title?: string
  content: string
  format: string
  views: number
  likes: number
  last_viewed_at?: string
  created_at: string
  agent_name?: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:15080'

export default function ChannelPage() {
  const params = useParams()
  const name = params.name as string

  const [channel, setChannel] = useState<Channel | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [chRes, postsRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/channels/${name}`),
          fetch(`${API_BASE}/api/v1/channels/${name}/posts?limit=50`),
        ])

        if (!chRes.ok) {
          setError('Channel not found')
          return
        }

        setChannel(await chRes.json())
        if (postsRes.ok) {
          setPosts(await postsRes.json())
        }
      } catch {
        setError('Failed to load channel')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [name])

  return (
    <main className="min-h-[100dvh] bg-white">
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
              Home
            </Link>
            <span className="text-slate-300">/</span>
            <Link href="/explore" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
              Explore
            </Link>
          </div>

          {channel && (
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
                {channel.display_name || channel.name}
              </h1>
              {channel.description && (
                <p className="text-slate-500 text-sm leading-relaxed max-w-2xl">
                  {channel.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                <span>{posts.length} posts</span>
                {channel.agent_id && (
                  <span className="inline-flex items-center gap-1 text-orange-400">
                    <span className="text-[8px]">&#9679;</span>
                    Agent: {channel.agent_id}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <SkeletonGrid count={9} />
        ) : error ? (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-6">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon="search"
            message="No posts in this channel yet."
            action={
              <Link
                href="/"
                className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl px-4 py-2 transition-colors"
              >
                Publish to this channel
              </Link>
            }
          />
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {posts.map((post) => (
              <StaggerItem key={post.id}>
                <PostCard
                  slug={post.slug}
                  title={post.title}
                  aiTitle={post.ai_title}
                  format={post.format}
                  views={post.views}
                  likes={post.likes}
                  lastViewedAt={post.last_viewed_at}
                  createdAt={post.created_at}
                  agentName={post.agent_name}
                />
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>
    </main>
  )
}
