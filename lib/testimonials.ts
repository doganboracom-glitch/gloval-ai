import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { uniquePageSlug } from '@/lib/page-slugs'

/**
 * Customer reviews
 * ----------------
 * A `testimonials` section may own one system page (`/musteri-yorumlari`, `detailOf: 'testimonials'`).
 * Only `pageEnabled === true` creates it, so every site saved before this feature keeps its pages untouched.
 * The page is live while at least one REAL review exists: owner-written, not flagged `sample`, with a
 * quote and an author. Platform placeholders are never real, never public and can never be "approved".
 * Pure and shared by the renderer, editor, sitemap and public routes.
 */

type Lang = 'tr' | 'en'
type TestimonialsSection = Extract<Section, { type: 'testimonials' }>
export type TestimonialItem = TestimonialsSection['items'][number]

export const TESTIMONIAL_QUOTE_MAX = 280
export const TESTIMONIAL_AUTHOR_MAX = 80
export const TESTIMONIAL_ROLE_MAX = 80
export const TESTIMONIALS_HOME_PREVIEW = 3

const SLUGS: Record<Lang, string> = { tr: 'musteri-yorumlari', en: 'reviews' }
const TITLES: Record<Lang, string> = { tr: 'Müşteri Yorumları', en: 'Customer Reviews' }
const LINK_LABELS: Record<Lang, string> = { tr: 'Tüm yorumları gör', en: 'See all reviews' }

const siteLang = (site: Pick<WebsiteSchema, 'meta'>): Lang => (site.meta.language === 'en' ? 'en' : 'tr')

export function testimonialsPageTitle(lang: Lang): string {
  return TITLES[lang]
}
export function testimonialsLinkDefaultLabel(lang: Lang): string {
  return LINK_LABELS[lang]
}

export function clampRating(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.round(value)
  return rounded >= 1 && rounded <= 5 ? rounded : undefined
}

/** Up to two initials, locale aware ("ayşe yılmaz" -> "AY"). Empty names give "?". */
export function authorInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
  if (parts.length === 0) return '?'
  const first = Array.from(parts[0])[0] ?? ''
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? '') : ''
  return `${first}${last}`.toLocaleUpperCase('tr')
}

/** A review that may appear on the public site: owner content with a quote and an author. */
export function isRealTestimonial(item: TestimonialItem): boolean {
  return !item.sample && item.quote.trim().length > 0 && item.author.trim().length > 0
}

export function realTestimonials(section: Pick<TestimonialsSection, 'items'>): TestimonialItem[] {
  return section.items.filter(isRealTestimonial)
}

/**
 * Illustrative reviews for a freshly generated site. They are flagged `sample`: visible in the editor
 * with a badge, removed from every public render, and impossible to approve at publish. The owner
 * replaces them with real customers or hides the section. No names of real people, no photos, no ratings.
 */
export function seedTestimonialItems(lang: Lang): TestimonialItem[] {
  const copy =
    lang === 'en'
      ? [
          { quote: 'Replace this with a real customer review. Short, specific and in their own words works best.', author: 'Customer name', role: 'Customer' },
          { quote: 'Add what the customer asked for, what you delivered and how it went.', author: 'Customer name', role: 'Customer' },
          { quote: 'Ask happy customers for a sentence or two and paste it here with their permission.', author: 'Customer name', role: 'Customer' },
        ]
      : [
          { quote: 'Bu metni gerçek bir müşteri yorumuyla değiştirin. Kısa, somut ve müşterinin kendi cümleleriyle olması en iyisidir.', author: 'Müşteri adı', role: 'Müşteri' },
          { quote: 'Müşterinin ne istediğini, neyi teslim ettiğinizi ve sürecin nasıl geçtiğini buraya ekleyin.', author: 'Müşteri adı', role: 'Müşteri' },
          { quote: 'Memnun müşterilerinizden bir iki cümle isteyin ve izinleriyle buraya yapıştırın.', author: 'Müşteri adı', role: 'Müşteri' },
        ]
  return copy.map((item) => ({ ...item, sample: true }))
}

/** Gives a generated `testimonials` section the new defaults. Idempotent. */
export function seedTestimonialsSection<T extends WebsiteSchema>(site: T): T {
  const lang = siteLang(site)
  let changed = false
  const sections = site.sections.map((section): Section => {
    if (section.type !== 'testimonials') return section
    const hasReal = section.items.some(isRealTestimonial)
    if (hasReal || section.pageEnabled !== undefined) return section
    changed = true
    return {
      ...section,
      items: seedTestimonialItems(lang),
      showAvatars: true,
      pageEnabled: true,
      linkEnabled: true,
    }
  })
  return changed ? { ...site, sections } : site
}

function testimonialSections(site: Pick<WebsiteSchema, 'sections' | 'pages'>): TestimonialsSection[] {
  const all = [...site.sections, ...(site.pages ?? []).flatMap((p) => p.sections ?? [])]
  return all.filter((s): s is TestimonialsSection => s.type === 'testimonials' && !s.hidden)
}

export function findTestimonialsPage(site: Pick<WebsiteSchema, 'pages'>) {
  return (site.pages ?? []).find((p) => p.kind === 'detail' && p.detailOf === 'testimonials') ?? null
}

export type ResolvedTestimonials = {
  lang: Lang
  slug: string
  title: string
  section: TestimonialsSection | null
  items: TestimonialItem[]
  /** The system page exists, its switch is on and at least one real review backs it. */
  active: boolean
}

export function resolveTestimonials(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
): ResolvedTestimonials {
  const lang = siteLang(site)
  const page = findTestimonialsPage(site)
  let section: TestimonialsSection | null = null
  let items: TestimonialItem[] = []
  for (const candidate of testimonialSections(site)) {
    const real = realTestimonials(candidate)
    if (real.length > 0) {
      section = candidate
      items = real
      break
    }
  }
  return {
    lang,
    slug: page?.slug || SLUGS[lang],
    title: page?.title || TITLES[lang],
    section,
    items,
    active: !!page && !!section && section.pageEnabled === true && items.length > 0,
  }
}

/** Where the home section's "all reviews" link points, or null when it must not be shown. */
export function testimonialsLink(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
  section: Pick<TestimonialsSection, 'linkEnabled' | 'linkLabel'>,
): { href: string; label: string } | null {
  if (section.linkEnabled === false) return null
  const resolved = resolveTestimonials(site)
  if (!resolved.active) return null
  return {
    href: `/${resolved.slug}`,
    label: section.linkLabel?.trim() || LINK_LABELS[resolved.lang],
  }
}

export function testimonialsDescription(site: Pick<WebsiteSchema, 'meta'>, name: string, count: number): string {
  return siteLang(site) === 'en'
    ? `${count} customer reviews for ${name}.`
    : `${name} müşteri yorumları (${count}).`
}

/**
 * Keeps the system page in step with the section: created while a section with `pageEnabled` has a real
 * review, dropped again when not. New pages count toward the plan page limit. Idempotent; returns the
 * same object when nothing changes. A page the owner already runs on the same address is left alone.
 */
export function syncTestimonialsPage<T extends WebsiteSchema>(site: T, pageLimit: number = SITE_PAGE_HARD_CAP): T {
  const pages = site.pages ?? []
  const existing = findTestimonialsPage(site)
  const wanted = testimonialSections(site).some((s) => s.pageEnabled === true && realTestimonials(s).length > 0)
  if (!wanted) {
    if (!existing) return site
    return { ...site, pages: pages.filter((p) => p !== existing) }
  }
  if (existing) return site

  const lang = siteLang(site)
  const own = new Set([SLUGS.tr, SLUGS.en])
  if (pages.some((p) => !p.isHome && own.has((p.slug || '').toLowerCase()))) return site
  if (pages.length >= Math.min(pageLimit, SITE_PAGE_HARD_CAP)) return site

  const taken = new Set(pages.map((p) => (p.slug || '').toLowerCase()))
  const slug = taken.has(SLUGS[lang]) ? uniquePageSlug(SLUGS[lang], taken) : SLUGS[lang]
  const created = { slug, title: TITLES[lang], kind: 'detail' as const, detailOf: 'testimonials' as const }
  const base = pages.length === 0 ? [{ slug: 'home', title: site.meta.name, isHome: true }] : pages
  return { ...site, pages: [...base, created] }
}
