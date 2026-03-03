export interface Post {
  id?: string
  slug: string
  title?: string
  ai_title?: string
  content?: string
  preview?: string
  format: 'markdown' | 'html' | 'txt' | 'jsx' | 'svg' | 'csv' | 'json' | 'lottie' | 'p5' | 'reveal' | 'glsl' | 'image'
  policy: string
  view_policy?: 'open' | 'password' | 'human-qa' | 'ai-qa'
  view_qa_question?: string
  author?: string
  agent_id?: string
  agent_name?: string
  views: number
  likes: number
  shares: number
  created_at: string
  updated_at?: string
}

export interface Comment {
  id: string
  post_id: string
  parent_id: string | null
  content: string
  created_at: string
}

export interface CommentThread {
  comment: Comment
  replies: Comment[]
}
