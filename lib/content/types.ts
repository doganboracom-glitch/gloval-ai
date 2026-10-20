import type { Lang } from '@/lib/i18n'

/**
 * Content model for the marketing FAQ + blog modules.
 *
 * These types are deliberately the same shape a database row would have, so
 * swapping the static sources in `faq.ts` / `blog.ts` for a real CMS later is a
 * change inside those two modules only — every consumer talks to the service
 * functions, never to the underlying arrays.
 *
 * Localized copy is stored as `Localized<T>` (one value per language) rather
 * than one row per locale, which keeps a post and its translation impossible to
 * get out of sync while there is no CMS enforcing that relationship.
 *
 * Content is currently translated in full for `tr`/`en` only. `en` is
 * mandatory and every other one of the 12 platform locales is optional —
 * use `getLocalized()` (below) to read a value, never index `[locale]`
 * directly, so an untranslated locale falls back to English instead of
 * rendering `undefined`.
 */
export type Localized<T> = Partial<Record<Lang, T>> & { en: T }

/** Reads a `Localized<T>` value for `locale`, falling back to English. */
export function getLocalized<T>(value: Localized<T>, locale: Lang): T {
  return value[locale] ?? value.en
}

export type FaqItem = {
  /** Stable key. Safe to use as a React key and as an anchor id. */
  id: string
  question: Localized<string>
  answer: Localized<string>
  /**
   * Whether this entry appears in the homepage summary. The homepage shows a
   * curated subset, so it is an explicit flag rather than "first N of the list"
   * — reordering the full list must not silently change the homepage.
   */
  featured: boolean
}

/** Category slug. Free-form now that categories are managed in the admin. */
export type BlogCategoryId = string

export type BlogCategory = {
  /** The category slug; also the filter key on /blog. */
  id: BlogCategoryId
  label: Localized<string>
}

/** One paragraph or subheading of post body copy (static fallback content only). */
export type BlogBlock =
  | { type: 'paragraph'; text: Localized<string> }
  | { type: 'heading'; text: Localized<string> }
  | { type: 'list'; items: Localized<string[]> }

/** Shape of the file-based fallback posts in `blog-static.ts`. */
export type StaticBlogPost = {
  slug: string
  title: Localized<string>
  excerpt: Localized<string>
  body: BlogBlock[]
  coverImage?: string
  coverAlt?: Localized<string>
  category: BlogCategoryId
  author: string
  /** ISO dates (YYYY-MM-DD). */
  publishedAt: string
  updatedAt: string
  seoTitle: Localized<string>
  seoDescription: Localized<string>
  keywords: Localized<string[]>
  featured: boolean
}

/** A post as the public pages consume it, regardless of where it came from. */
export type BlogPost = {
  /** SEO-friendly, ascii-only slug used as the URL segment. */
  slug: string
  title: Localized<string>
  excerpt: Localized<string>
  /**
   * Article body in the blog markup (see lib/blog-markup.ts). Empty on list
   * results: only the detail query loads the body.
   */
  markup: Localized<string>
  coverImage?: string
  coverAlt?: Localized<string>
  category: BlogCategoryId
  /** Display label so client components never look categories up themselves. */
  categoryLabel?: Localized<string>
  author: string
  /** Full ISO timestamps. */
  publishedAt: string
  updatedAt: string
  seoTitle: Localized<string>
  seoDescription: Localized<string>
  keywords: Localized<string[]>
  tags: string[]
  featured: boolean
  noindex: boolean
  readingTime: number
  /** True when an English translation exists (drives the hreflang alternate). */
  hasEnglish: boolean
}
