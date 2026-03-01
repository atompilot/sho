import HomeClient from '@/components/HomeClient'

interface Post {
  id: string
  slug: string
  title?: string
  ai_title?: string
  content: string
  format: string
  policy: string
  views: number
  likes: number
  last_viewed_at?: string
  created_at: string
}

async function getRecommendedPosts(): Promise<Post[]> {
  try {
    const res = await fetch(
      `${process.env.API_URL}/api/v1/posts/recommended?limit=6`,
      { next: { revalidate: 30 } }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function HomePage() {
  const posts = await getRecommendedPosts()
  return <HomeClient posts={posts} />
}
