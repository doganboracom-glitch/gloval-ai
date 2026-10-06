import type { MetadataRoute } from 'next'
import { platformUrl } from '@/lib/domains'
import { getPosts } from '@/lib/content/blog'
import { LEGAL_SLUGS } from '@/lib/legal/documents'

/**
 * Sitemap for the GLOVAL platform itself (https://gloval.ai/sitemap.xml).
 *
 * Only public, indexable pages are listed. Authenticated or transactional
 * areas (/dashboard, /editor, /ecommerce, /billing, /admin, /auth) are
 * intentionally excluded — they are also disallowed in robots.txt.
 *
 * `/demo/*` pages are intentionally NOT listed here: every demo route sets
 * `robots: { index: false }` in its own metadata (they are illustrative
 * examples, not real content), and a noindex page in the sitemap triggers a
 * "Submitted URL marked 'noindex'" warning in Search Console. Demo pages stay
 * crawlable/followable (see robots.ts) so their internal links still get
 * discovered, but they are never submitted for indexing.
 *
 * Every page renders in Turkish by default and in English through the `?lang=en`
 * query parameter, so each entry declares both as hreflang alternates.
 */

type Entry = MetadataRoute.Sitemap[number]

/** Builds one entry with tr/en alternates for a platform path. */
function entry(
  path: string,
  options: { lastModified?: string | Date; changeFrequency?: Entry['changeFrequency']; priority?: number } = {},
): Entry {
  const url = platformUrl(path)
  const separator = path.includes('?') ? '&' : '?'
  return {
    url,
    lastModified: options.lastModified ?? new Date(),
    changeFrequency: options.changeFrequency ?? 'monthly',
    priority: options.priority ?? 0.6,
    alternates: {
      languages: {
        tr: url,
        en: `${url}${separator}lang=en`,
      },
    },
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const marketing: MetadataRoute.Sitemap = [
    entry('/', { changeFrequency: 'weekly', priority: 1 }),
    entry('/blog', { changeFrequency: 'weekly', priority: 0.8 }),
    entry('/sss', { changeFrequency: 'monthly', priority: 0.7 }),
    entry('/iletisim', { changeFrequency: 'yearly', priority: 0.5 }),
  ]

  // Legal / corporate pages required for a production SaaS (and PayTR review).
  const legal: MetadataRoute.Sitemap = LEGAL_SLUGS.map((slug) =>
    entry(`/yasal/${slug}`, { changeFrequency: 'yearly', priority: 0.4 }),
  )

  const posts: MetadataRoute.Sitemap = getPosts().map((post) =>
    entry(`/blog/${post.slug}`, {
      lastModified: post.updatedAt ?? post.publishedAt,
      changeFrequency: 'yearly',
      priority: 0.7,
    }),
  )

  return [...marketing, ...legal, ...posts]
}
