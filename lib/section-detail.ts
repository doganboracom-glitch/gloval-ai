import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { isUsableImageSrc, usableAboutImages } from '@/lib/about-media'

/**
 * Section detail pages
 * --------------------
 * A section (the about section is the first user) can link to a long-form page
 * with a "Daha fazlası…" link. The page body lives on the section
 * (`section.detail`); the matching `pages` entry (`kind: 'detail'`) is only the
 * route. Everything here is pure, so the renderer, the editor, the generator
 * and the sitemap share one definition. Nothing is invented: the starter text
 * only restates what the brief/site already says and is flagged `sample`.
 */

export const DETAIL_KINDS = ['about'] as const
export type DetailKind = (typeof DETAIL_KINDS)[number]

export const MAX_DETAIL_BLOCKS = 12
export const MAX_DETAIL_IMAGES = 3
export const MAX_DETAIL_BODY = 5000

type Lang = 'tr' | 'en'
type AboutData = Extract<Section, { type: 'about' }>
export type SectionDetail = NonNullable<AboutData['detail']>
export type DetailBlock = NonNullable<SectionDetail['blocks']>[number]

const SLUGS: Record<DetailKind, Record<Lang, string>> = {
  about: { tr: 'hakkimizda', en: 'about' },
}
const TITLES: Record<DetailKind, Record<Lang, string>> = {
  about: { tr: 'Hakkımızda', en: 'About us' },
}
const LINK_LABELS: Record<Lang, string> = { tr: 'Daha fazlası…', en: 'Learn more…' }

const siteLang = (site: Pick<WebsiteSchema, 'meta'>): Lang => (site.meta.language === 'en' ? 'en' : 'tr')

export function defaultDetailLinkLabel(lang: Lang): string {
  return LINK_LABELS[lang]
}

export function detailPageTitle(kind: DetailKind, lang: Lang): string {
  return TITLES[kind][lang]
}

function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const ABOUT_PAGE_WORDS = new Set([
  'hakkimizda',
  'hakkinda',
  'hakkimizda sayfasi',
  'kurumsal',
  'biz kimiz',
  'about',
  'about us',
])

function looksLikeAboutPage(page: { slug: string; title: string }): boolean {
  return ABOUT_PAGE_WORDS.has(fold(page.slug)) || ABOUT_PAGE_WORDS.has(fold(page.title))
}

/** The home about section a detail page belongs to (first, visible or not). */
export function findAboutSection(site: Pick<WebsiteSchema, 'sections'>): AboutData | null {
  return (site.sections.find((s) => s.type === 'about') as AboutData | undefined) ?? null
}

export function findDetailPage(site: Pick<WebsiteSchema, 'pages'>, kind: DetailKind = 'about') {
  return (site.pages ?? []).find((p) => p.kind === 'detail' && p.detailOf === kind) ?? null
}

export type ResolvedAboutDetail = {
  section: AboutData
  detail: SectionDetail
  /** True when the page is on, the section is visible and the page exists. */
  pageActive: boolean
  pageSlug: string
  pageTitle: string
  /** Link rendered on the home section, or null when it must not show. */
  link: { label: string; href: string } | null
  blocks: DetailBlock[]
}

export function cleanDetailBlocks(blocks: SectionDetail['blocks']): DetailBlock[] {
  return (blocks ?? [])
    .map((b) => ({
      heading: b.heading?.trim() || undefined,
      level: b.level === 'h3' ? ('h3' as const) : ('h2' as const),
      body: (b.body ?? '').trim().slice(0, MAX_DETAIL_BODY),
    }))
    .filter((b) => b.body.length > 0 || b.heading)
    .slice(0, MAX_DETAIL_BLOCKS)
}

/** null when the site has no about section with a detail page configured. */
export function resolveAboutDetail(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
): ResolvedAboutDetail | null {
  const section = findAboutSection(site)
  if (!section?.detail) return null
  const lang = siteLang(site)
  const page = findDetailPage(site)
  const pageActive = !section.hidden && section.detail.pageEnabled !== false && !!page
  const pageSlug = page?.slug || SLUGS.about[lang]
  const label = section.detail.linkLabel?.trim() || LINK_LABELS[lang]
  return {
    section,
    detail: section.detail,
    pageActive,
    pageSlug,
    pageTitle: page?.title || TITLES.about[lang],
    link: pageActive && section.detail.linkEnabled !== false ? { label, href: `/${pageSlug}` } : null,
    blocks: cleanDetailBlocks(section.detail.blocks),
  }
}

/** Link shown under the about text on the home page, or null. */
export function aboutDetailLink(site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>) {
  return resolveAboutDetail(site)?.link ?? null
}

/* -------------------------------------------------------------------------- */
/*  Starter content (restates what the site already says, never invents)       */
/* -------------------------------------------------------------------------- */

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Deterministic starter body used when the AI writer is unavailable or fails.
 * It only reorganizes the about section's own text, highlights, tagline and
 * audience; every block is flagged via `sample: true` so the owner reviews it.
 */
export function buildStarterAboutDetail(
  site: Pick<WebsiteSchema, 'meta' | 'sections'>,
  section: AboutData,
): SectionDetail {
  const lang = siteLang(site)
  const blocks: DetailBlock[] = []
  const intro = splitParagraphs(section.body)
  if (intro.length > 0) blocks.push({ heading: section.title, level: 'h2', body: intro.join('\n\n') })
  if (site.meta.tagline?.trim()) {
    blocks.push({
      heading: lang === 'tr' ? 'Yaklaşımımız' : 'Our approach',
      level: 'h2',
      body: site.meta.tagline.trim(),
    })
  }
  if (section.highlights && section.highlights.length > 0) {
    blocks.push({
      heading: lang === 'tr' ? 'Öne çıkanlar' : 'Highlights',
      level: 'h2',
      body: section.highlights.map((h) => `- ${h}`).join('\n'),
    })
  }
  if (site.meta.audience?.trim()) {
    blocks.push({
      heading: lang === 'tr' ? 'Kimler için çalışıyoruz' : 'Who we work for',
      level: 'h2',
      body: site.meta.audience.trim(),
    })
  }
  return {
    linkEnabled: true,
    pageEnabled: true,
    heading: section.title,
    blocks: cleanDetailBlocks(blocks),
    sample: true,
  }
}

/** Seeds `detail` on an about section that has none. Same object back when nothing changes. */
export function seedAboutDetail<T extends Pick<WebsiteSchema, 'sections' | 'meta'>>(
  site: T,
  detail?: SectionDetail,
): T {
  const about = findAboutSection(site)
  if (!about || about.detail) return site
  const next = detail ?? buildStarterAboutDetail(site, about)
  return { ...site, sections: site.sections.map((s) => (s === about ? { ...about, detail: next } : s)) }
}

/* -------------------------------------------------------------------------- */
/*  Page sync                                                                  */
/* -------------------------------------------------------------------------- */

function freeSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

/**
 * Keeps the `pages` list in step with the about section's `detail`:
 *  - detail on  -> exactly one `kind: 'detail'` page (an existing empty
 *    "Hakkımızda" page is adopted instead of creating a duplicate);
 *  - detail off / section hidden or removed -> that page is dropped.
 * The detail page COUNTS toward the plan page limit: a new page is only
 * created while `pages.length < pageLimit` (adopting an existing page never
 * adds one). Idempotent; returns the same object when nothing changes.
 */
export function syncDetailPages<T extends WebsiteSchema>(site: T, pageLimit: number = SITE_PAGE_HARD_CAP): T {
  const about = findAboutSection(site)
  const wanted = !!about?.detail && !about.hidden && about.detail.pageEnabled !== false
  const pages = site.pages ?? []
  const existing = findDetailPage(site)

  if (!wanted) {
    if (!existing) return site
    return { ...site, pages: pages.filter((p) => p !== existing) }
  }
  if (existing) return site

  const lang = siteLang(site)
  const adopt = pages.find(
    (p) => !p.isHome && p.kind !== 'detail' && !(p.sections && p.sections.length > 0) && looksLikeAboutPage(p),
  )
  if (adopt) {
    return {
      ...site,
      pages: pages.map((p) => (p === adopt ? { ...p, kind: 'detail' as const, detailOf: 'about' as const } : p)),
    }
  }
  if (pages.length >= Math.min(pageLimit, SITE_PAGE_HARD_CAP)) return site

  const taken = new Set(pages.map((p) => (p.slug || '').toLowerCase()))
  const slug = freeSlug(SLUGS.about[lang], taken)
  const created = { slug, title: TITLES.about[lang], kind: 'detail' as const, detailOf: 'about' as const }
  // A bare site has no explicit home yet; keep that implicit home first.
  const base = pages.length === 0 ? [{ slug: 'home', title: site.meta.name, isHome: true }] : pages
  return { ...site, pages: [...base, created] }
}

/* -------------------------------------------------------------------------- */
/*  Page content helpers                                                       */
/* -------------------------------------------------------------------------- */

export type DetailImage = { src: string; alt: string }

/** Large image of the detail page: the section's own first usable about image. */
export function detailLeadImage(section: AboutData, fallbackAlt: string): DetailImage | null {
  return usableAboutImages(section.media, fallbackAlt)[0] ?? null
}

/** Strip images: owner-picked ones first, otherwise the about images after the lead. */
export function detailStripImages(section: AboutData, fallbackAlt: string): DetailImage[] {
  const own = (section.detail?.images ?? [])
    .filter((i) => isUsableImageSrc(i.src))
    .slice(0, MAX_DETAIL_IMAGES)
    .map((i) => ({ src: (i.src as string).trim(), alt: i.alt?.trim() || fallbackAlt }))
  if (own.length > 0) return own
  return usableAboutImages(section.media, fallbackAlt).slice(1, 1 + MAX_DETAIL_IMAGES)
}

/** Splits a block body into paragraphs and "- " bullet lists. */
export type BodyPart = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

export function parseDetailBody(body: string): BodyPart[] {
  const parts: BodyPart[] = []
  for (const chunk of splitParagraphs(body)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length > 0 && lines.every((l) => /^[-•]\s+/.test(l))) {
      parts.push({ type: 'ul', items: lines.map((l) => l.replace(/^[-•]\s+/, '')) })
    } else {
      parts.push({ type: 'p', text: lines.join(' ') })
    }
  }
  return parts
}

/** True when the owner (or AI) wrote something beyond the platform starter. */
export function detailIsSample(detail: SectionDetail | undefined): boolean {
  return !!detail && detail.sample === true
}

/** Plain-text digest for the meta description of the detail page. */
export function detailDescription(resolved: ResolvedAboutDetail): string {
  const first = resolved.blocks.find((b) => b.body)
  const text = first ? parseDetailBody(first.body).find((p) => p.type === 'p') : null
  const source = text && text.type === 'p' ? text.text : resolved.section.body
  return source.replace(/\s+/g, ' ').trim().slice(0, 160)
}
