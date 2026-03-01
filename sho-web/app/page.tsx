import HomeClient from '@/components/HomeClient'

interface Post {
  id: string
  slug: string
  title?: string
  content: string
  format: string
  policy: string
  views: number
  created_at: string
}

async function getRecentPosts(): Promise<Post[]> {
  try {
    const res = await fetch(
      `${process.env.API_URL}/api/v1/posts?limit=6`,
      { next: { revalidate: 30 } }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function HomePage() {
  const posts = await getRecentPosts()
  return <HomeClient posts={posts} />
}
