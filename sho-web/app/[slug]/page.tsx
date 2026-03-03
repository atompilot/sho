import { notFound } from 'next/navigation'
import { UnifiedFeedClient } from '@/components/UnifiedFeedClient'
import type { Post } from '@/types/post'

const API_URL = process.env.API_URL || 'http://localhost:15080'

async function getPost(slug: string): Promise<Post | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/posts/${slug}`, {
      cache: 'no-store',
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`fetch post failed: ${res.status}`)
    return res.json()
  } catch (err) {
    throw err
  }
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()

  return <UnifiedFeedClient initialPost={post} />
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  return { title: post?.ai_title || post?.title || slug }
}
