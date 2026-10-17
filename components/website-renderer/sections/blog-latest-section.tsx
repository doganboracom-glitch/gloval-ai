'use client'

import { useLatestPosts } from '@/components/website-renderer/site-blog-context'
import { WebsiteLatestPosts } from '@/components/website-renderer/sections/website-latest-posts'

/**
 * The movable "latest posts" section. It renders nothing while the blog has no
 * public post (and the starter posts are not pending), so a published site
 * never shows an empty block; the editor preview shows the skeleton instead.
 */
export function BlogLatestSection({ title, lang }: { title?: string; lang: 'tr' | 'en' }) {
  const latest = useLatestPosts()
  if (!latest) return null
  return <WebsiteLatestPosts blog={latest.blog} lang={lang} title={title} />
}
