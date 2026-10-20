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
  options: {
    lastModified?: string | Date
    changeFrequency?: Entry['changeFrequency']
    priority?: number
    /** False for pages that have no English version, so no dead hreflang is declared. */
    english?: boolean
  } = {},
): Entry {
  const url = platformUrl(path)
  return {
    url,
    // Omitted unless the page has a real modification date: stamping every
    // entry with "now" on each request teaches crawlers to ignore lastmod.
    ...(options.lastModified ? { lastModified: options.lastModified } : {}),
    changeFrequency: options.changeFrequency ?? 'monthly',
    priority: options.priority ?? 0.6,
    alternates: {
      languages: {
        'tr-TR': url,
        ...(options.english === false ? {} : { en: `${url}?lang=en` }),
        'x-default': url,
      },
    },
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketing: MetadataRoute.Sitemap = [
    entry('/', { changeFrequency: 'weekly', priority: 1 }),
    entry('/blog', { changeFrequency: 'weekly', priority: 0.8 }),
    entry('/sss', { changeFrequency: 'monthly', priority: 0.7 }),
    entry('/iletisim', { changeFrequency: 'yearly', priority: 0.5 }),
  ]

  // Legal / corporate pages required for a production SaaS (and payment provider review).
  const legal: MetadataRoute.Sitemap = LEGAL_SLUGS.map((slug) =>
    entry(`/yasal/${slug}`, { changeFrequency: 'yearly', priority: 0.4 }),
  )

  // Live posts only (drafts and not-yet-due scheduled posts never reach
  // getPosts), and noindex posts are kept out of the sitemap on purpose.
  const posts: MetadataRoute.Sitemap = (await getPosts())
    .filter((post) => !post.noindex)
    .map((post) =>
      entry(`/blog/${post.slug}`, {
        lastModified: post.updatedAt ?? post.publishedAt,
        changeFrequency: 'yearly',
        priority: 0.7,
        english: post.hasEnglish,
      }),
    )

  return [...marketing, ...legal, ...posts]
}
