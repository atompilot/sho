import { notFound } from 'next/navigation'
import { ContentRenderer } from '@/components/ContentRenderer'

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

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      {post.title && (
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
          {post.title}
        </h1>
      )}
      <div className="mb-6 flex items-center gap-4 text-sm text-gray-500">
        <span>{new Date(post.created_at).toLocaleDateString()}</span>
        <span>{post.views} views</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
          {post.format}
        </span>
      </div>
      <ContentRenderer content={post.content} format={post.format} />
    </main>
  )
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
