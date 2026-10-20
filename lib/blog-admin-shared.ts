import { BLOG_BODY_MAX, isSafeImageSrc, readingTimeMinutes, sanitizeBlogMarkup } from '@/lib/blog-markup'

/**
 * Pure (client + server safe) pieces of the blog admin: slug generation and the
 * single validator the save action runs. The form uses the same limits for its
 * character counters, so what the editor shows is what the server enforces.
 */

export const POST_STATUSES = ['draft', 'published', 'scheduled'] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export const LIMITS = {
  title: 200,
  slug: 80,
  excerpt: 300,
  body: BLOG_BODY_MAX,
  seoTitle: 70,
  metaDescription: 180,
  coverAlt: 200,
  author: 80,
  tag: 40,
  tags: 10,
  categoryName: 80,
  categorySlug: 60,
  categoryDescription: 300,
} as const

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const TURKISH_FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/** Turkish-aware ASCII slug: "Özel Tasarım Nedir?" becomes "ozel-tasarim-nedir". */
export function slugifyBlog(input: string, max: number = LIMITS.slug): string {
  const folded = input
    .replace(/İ/g, 'i')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (ch) => TURKISH_FOLD[ch] ?? ch)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return folded
    .replace(/&/g, ' ve ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

export type EnglishInput = {
  title: string
  excerpt: string
  body: string
  seoTitle: string
  metaDescription: string
}

export type PostInput = {
  id?: string
  title: string
  slug: string
  excerpt: string
  body: string
  categoryId: string | null
  tags: string[]
  coverUrl: string
  coverAlt: string
  seoTitle: string
  metaDescription: string
  status: PostStatus
  /** ISO timestamp. Required for scheduled; kept for published so the date never drifts. */
  publishedAt: string | null
  authorName: string
  noindex: boolean
  featured: boolean
  en: EnglishInput
}

export type ValidPost = {
  title: string
  slug: string
  excerpt: string | null
  body: string
  categoryId: string | null
  tags: string[]
  coverUrl: string | null
  coverAlt: string | null
  seoTitle: string | null
  metaDescription: string | null
  status: PostStatus
  publishedAt: string | null
  authorName: string
  noindex: boolean
  featured: boolean
  readingTime: number
  translations: { en?: { title: string; excerpt: string; body: string; seo_title: string; meta_description: string } }
}

export type FieldErrors = Partial<Record<string, string>>

export function emptyEnglish(): EnglishInput {
  return { title: '', excerpt: '', body: '', seoTitle: '', metaDescription: '' }
}

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const oneLine = (value: unknown) => clean(value).replace(/\s+/g, ' ')

export function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of list) {
    const tag = oneLine(item).slice(0, LIMITS.tag)
    const key = tag.toLocaleLowerCase('tr')
    if (tag && !seen.has(key)) {
      seen.add(key)
      tags.push(tag)
    }
  }
  return tags
}

/**
 * Validates and normalizes a post. `now` is injectable so scheduling rules are
 * testable. Error values are stable codes the form maps to localized messages.
 */
export function validatePost(
  raw: PostInput,
  now: number = Date.now(),
): { ok: true; value: ValidPost } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}

  const title = oneLine(raw.title)
  if (!title) errors.title = 'required'
  else if (title.length > LIMITS.title) errors.title = 'too_long'

  const slug = clean(raw.slug)
  if (!slug) errors.slug = 'required'
  else if (!SLUG_PATTERN.test(slug) || slug.length > LIMITS.slug) errors.slug = 'invalid'

  const excerpt = oneLine(raw.excerpt)
  if (excerpt.length > LIMITS.excerpt) errors.excerpt = 'too_long'

  const body = sanitizeBlogMarkup(typeof raw.body === 'string' ? raw.body : '')
  if (body.length > LIMITS.body) errors.body = 'too_long'

  const seoTitle = oneLine(raw.seoTitle)
  if (seoTitle.length > LIMITS.seoTitle) errors.seoTitle = 'too_long'
  const metaDescription = oneLine(raw.metaDescription)
  if (metaDescription.length > LIMITS.metaDescription) errors.metaDescription = 'too_long'

  const coverUrl = clean(raw.coverUrl)
  if (coverUrl && !isSafeImageSrc(coverUrl)) errors.coverUrl = 'invalid'
  const coverAlt = oneLine(raw.coverAlt)
  if (coverAlt.length > LIMITS.coverAlt) errors.coverAlt = 'too_long'

  const authorName = oneLine(raw.authorName) || 'GLOVAL AI'
  if (authorName.length > LIMITS.author) errors.authorName = 'too_long'

  const tags = normalizeTags(raw.tags)
  if (tags.length > LIMITS.tags) errors.tags = 'too_many'

  if (!POST_STATUSES.includes(raw.status)) errors.status = 'invalid'

  let publishedAt: string | null = null
  if (raw.status === 'scheduled') {
    const at = raw.publishedAt ? Date.parse(raw.publishedAt) : NaN
    if (Number.isNaN(at)) errors.publishedAt = 'required'
    else if (at <= now) errors.publishedAt = 'past'
    else publishedAt = new Date(at).toISOString()
  } else if (raw.status === 'published') {
    const at = raw.publishedAt ? Date.parse(raw.publishedAt) : NaN
    publishedAt = new Date(Number.isNaN(at) || at > now ? now : at).toISOString()
  }

  if (raw.status !== 'draft' && !body) errors.body = errors.body ?? 'required_to_publish'

  const en = {
    title: oneLine(raw.en?.title),
    excerpt: oneLine(raw.en?.excerpt),
    body: sanitizeBlogMarkup(typeof raw.en?.body === 'string' ? raw.en.body : ''),
    seoTitle: oneLine(raw.en?.seoTitle),
    metaDescription: oneLine(raw.en?.metaDescription),
  }
  const hasAnyEnglish = Object.values(en).some(Boolean)
  if (hasAnyEnglish && !en.title) errors.enTitle = 'required'
  if (en.title.length > LIMITS.title) errors.enTitle = 'too_long'
  if (en.excerpt.length > LIMITS.excerpt) errors.enExcerpt = 'too_long'
  if (en.body.length > LIMITS.body) errors.enBody = 'too_long'
  if (en.seoTitle.length > LIMITS.seoTitle) errors.enSeoTitle = 'too_long'
  if (en.metaDescription.length > LIMITS.metaDescription) errors.enMetaDescription = 'too_long'

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      title,
      slug,
      excerpt: excerpt || null,
      body,
      categoryId: raw.categoryId || null,
      tags,
      coverUrl: coverUrl || null,
      coverAlt: coverAlt || null,
      seoTitle: seoTitle || null,
      metaDescription: metaDescription || null,
      status: raw.status,
      publishedAt,
      authorName,
      noindex: Boolean(raw.noindex),
      featured: Boolean(raw.featured),
      readingTime: readingTimeMinutes(body),
      translations: hasAnyEnglish
        ? {
            en: {
              title: en.title,
              excerpt: en.excerpt,
              body: en.body,
              seo_title: en.seoTitle,
              meta_description: en.metaDescription,
            },
          }
        : {},
    },
  }
}

export type CategoryInput = { id?: string; name: string; slug: string; description: string; sortOrder: number }

export function validateCategory(
  raw: CategoryInput,
): { ok: true; value: { name: string; slug: string; description: string | null; sortOrder: number } } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const name = oneLine(raw.name)
  if (!name) errors.name = 'required'
  else if (name.length > LIMITS.categoryName) errors.name = 'too_long'
  const slug = clean(raw.slug)
  if (!slug) errors.slug = 'required'
  else if (!SLUG_PATTERN.test(slug) || slug.length > LIMITS.categorySlug) errors.slug = 'invalid'
  const description = oneLine(raw.description)
  if (description.length > LIMITS.categoryDescription) errors.description = 'too_long'
  const sortOrder = Number.isFinite(raw.sortOrder) ? Math.max(0, Math.min(9999, Math.trunc(raw.sortOrder))) : 0
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, slug, description: description || null, sortOrder } }
}
