import Link from 'next/link'

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
      `${process.env.API_URL}/api/v1/posts?limit=20`,
      { next: { revalidate: 30 } }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default async function HomePage() {
  const posts = await getRecentPosts()

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-baseline justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sho</h1>
          <p className="text-sm text-gray-500 mt-1">Publish anything. No login required.</p>
        </div>
        <Link
          href="/new"
          className="bg-black text-white text-sm rounded px-4 py-2 hover:bg-gray-800 transition-colors"
        >
          New Sho
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-4">No posts yet.</p>
          <Link href="/new" className="text-black underline underline-offset-4 text-sm">
            Be the first to publish
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {posts.map((post) => {
            const preview = post.content.slice(0, 120).replace(/\n/g, ' ')
            return (
              <li key={post.id}>
                <Link
                  href={`/${post.slug}`}
                  className="block py-4 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-sm truncate">
                      {post.title || `/${post.slug}`}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {timeAgo(post.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{preview}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    <span>{post.format}</span>
                    <span>·</span>
                    <span>{post.policy}</span>
                    <span>·</span>
                    <span>{post.views} views</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
