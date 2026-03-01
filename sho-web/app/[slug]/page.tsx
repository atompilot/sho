import { notFound } from 'next/navigation'
import { PostViewer } from '@/components/PostViewer'

interface Post {
  id: string
  slug: string
  title?: string
  content: string
  format: 'markdown' | 'html' | 'txt' | 'jsx'
  policy: string
  views: number
  created_at: string
  updated_at: string
}

async function getPost(slug: string): Promise<Post | null> {
  const apiUrl = process.env.API_URL || 'http://localhost:15080'
  const res = await fetch(`${apiUrl}/api/v1/posts/${slug}`, {
    next: { revalidate: 60 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to fetch post')
  return res.json()
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()

  return <PostViewer post={post} />
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  return { title: post?.title ?? slug }
}
