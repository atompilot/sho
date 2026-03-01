import { notFound } from 'next/navigation'
import { PostViewer } from '@/components/PostViewer'

interface Post {
  id: string
  slug: string
  title?: string
  ai_title?: string
  content?: string
  preview?: string
  format: 'markdown' | 'html' | 'txt' | 'jsx' | 'svg' | 'csv' | 'json' | 'lottie' | 'p5' | 'reveal' | 'glsl'
  policy: string
  view_policy?: 'open' | 'password' | 'human-qa' | 'ai-qa'
  view_qa_question?: string
  views: number
  likes: number
  created_at: string
  updated_at: string
}

async function getPost(slug: string): Promise<Post | null> {
  try {
    const apiUrl = process.env.API_URL || 'http://localhost:15080'
    const res = await fetch(`${apiUrl}/api/v1/posts/${slug}`, {
      cache: 'no-store',
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`fetch post failed: ${res.status}`)
    return res.json()
  } catch (err) {
    // Re-throw all errors (network failures, API errors) so Next.js surfaces a 500
    // Only return null for explicit 404 (handled above before this catch)
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

  return <PostViewer post={post} initialLikes={post.likes} />
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
