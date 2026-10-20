import type { BlogPost } from '@/lib/content/types'

/**
 * RSS 2.0 feed for the platform blog (Turkish). Only posts that are live at
 * `now` and not marked noindex are listed, the same rule the sitemap uses.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const rfc822 = (iso: string) => new Date(iso).toUTCString()

export function buildBlogRss(
  posts: BlogPost[],
  options: { origin: string; now?: number },
): string {
  const now = options.now ?? Date.now()
  const origin = options.origin.replace(/\/+$/, '')
  const items = posts
    .filter((post) => !post.noindex && Date.parse(post.publishedAt) <= now)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  const lastBuild = items[0]?.publishedAt ?? new Date(now).toISOString()

  const body = items
    .map((post) => {
      const link = `${origin}/blog/${post.slug}`
      const category = post.categoryLabel?.tr
      return [
        '    <item>',
        `      <title>${escapeXml(post.title.tr ?? '')}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${rfc822(post.publishedAt)}</pubDate>`,
        `      <description>${escapeXml(post.excerpt.tr ?? '')}</description>`,
        category ? `      <category>${escapeXml(category)}</category>` : null,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>GLOVAL AI Blog</title>',
    `    <link>${escapeXml(`${origin}/blog`)}</link>`,
    '    <description>Web sitesi, yapay zekâ ve dijital büyüme üzerine yazılar.</description>',
    '    <language>tr-TR</language>',
    `    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${origin}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    body,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
