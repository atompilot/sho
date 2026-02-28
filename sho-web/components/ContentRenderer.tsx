'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  format: 'markdown' | 'html' | 'txt' | 'jsx'
}

export function ContentRenderer({ content, format }: Props) {
  if (format === 'markdown') {
    return (
      <div className="prose prose-gray max-w-none dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    )
  }

  if (format === 'html') {
    return (
      <div
        className="prose prose-gray max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    )
  }

  return (
    <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-200">
      {content}
    </pre>
  )
}
