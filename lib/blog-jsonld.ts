import type { BlogPost } from '@/lib/content/types'

/** BlogPosting structured data, built from the same record the page renders. */
export function platformPostJsonLd(post: BlogPost, origin = 'https://gloval.ai') {
  const base = origin.replace(/\/+$/, '')
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.seoTitle.tr,
    description: post.seoDescription.tr,
    inLanguage: 'tr-TR',
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { '@type': 'Organization', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'GLOVAL AI',
      logo: { '@type': 'ImageObject', url: `${base}/icon-512x512.png` },
    },
    mainEntityOfPage: `${base}/blog/${post.slug}`,
    ...(post.tags.length ? { keywords: post.tags.join(', ') } : {}),
    ...(post.coverImage
      ? { image: [post.coverImage.startsWith('http') ? post.coverImage : `${base}${post.coverImage}`] }
      : {}),
  }
}

/** Admin-authored text: `<` and line separators are escaped so no value can close the script tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
