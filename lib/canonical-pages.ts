import type { Section, SectionType, WebsiteSchema } from '@/lib/website-schema'
import { SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { uniquePageSlug } from '@/lib/page-slugs'
import { findPublicPage } from '@/lib/website-pages'

/**
 * Canonical page kinds of a generated site. Each one has a real URL per language
 * (`/hakkimizda`, `/hizmetlerimiz`, `/sss`, `/iletisim`, `/galeri`) and owns exactly
 * the sections that belong to it, so a page can never show another page's content.
 * Generation also uses this list to decide which pages fit the plan's page limit.
 */
export type CanonicalKind = 'about' | 'services' | 'faq' | 'contact' | 'gallery'

type Lang = 'tr' | 'en'

export const CANONICAL_SLUGS: Record<CanonicalKind, Record<Lang, string>> = {
  about: { tr: 'hakkimizda', en: 'about' },
  services: { tr: 'hizmetlerimiz', en: 'services' },
  faq: { tr: 'sss', en: 'faq' },
  contact: { tr: 'iletisim', en: 'contact' },
  gallery: { tr: 'galeri', en: 'gallery' },
}

export const CANONICAL_KINDS = Object.keys(CANONICAL_SLUGS) as CanonicalKind[]

export const CANONICAL_TITLES: Record<CanonicalKind, Record<Lang, string>> = {
  about: { tr: 'Hakkımızda', en: 'About' },
  services: { tr: 'Hizmetlerimiz', en: 'Services' },
  faq: { tr: 'Sıkça Sorulan Sorular', en: 'FAQ' },
  contact: { tr: 'İletişim', en: 'Contact' },
  gallery: { tr: 'Galeri', en: 'Gallery' },
}

/**
 * The address suggested for a new page of this kind: `/hakkimizda` (`/about` on an
 * English site), or `-2`, `-3`... when a page already uses it. Only a suggestion:
 * the owner can edit it, and existing pages' addresses are never touched.
 */
export function suggestPageSlug(kind: CanonicalKind, lang: Lang, takenSlugs: Iterable<string>): string {
  return uniquePageSlug(CANONICAL_SLUGS[kind][lang], takenSlugs)
}

/** Sections a page of this kind shows (besides the shared footer). */
export const CANONICAL_SECTION_TYPES: Record<CanonicalKind, SectionType[]> = {
  about: ['about', 'stats'],
  services: ['services'],
  faq: ['faq'],
  contact: ['contact'],
  gallery: ['gallery'],
}

/** Which pages win a place when the plan allows fewer pages than the model asked for. */
const KEEP_PRIORITY: Record<CanonicalKind, number> = { about: 1, contact: 2, faq: 3, gallery: 4, services: 5 }
const OTHER_PRIORITY = 10

type PageEntry = NonNullable<WebsiteSchema['pages']>[number]

function fold(text: string): string {
  return (text ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
}

const KIND_STEMS: Array<[CanonicalKind, RegExp]> = [
  ['about', /^(hakkimizda|hakkinda|about|kurumsal|hikayemiz|story)/],
  ['faq', /^(sss|faq|sikca|sorular|questions)/],
  ['contact', /^(iletisim|contact|ulasim|ulasin)/],
  ['services', /^(hizmet|service)/],
  ['gallery', /^(galeri|gallery)/],
]

function kindOfText(text: string): CanonicalKind | null {
  const tokens = fold(text).split(/[^a-z0-9]+/).filter(Boolean)
  for (const [kind, stem] of KIND_STEMS) if (tokens.some((t) => stem.test(t))) return kind
  return null
}

/** The canonical kind a page is, from its system role first and its slug/title otherwise. */
export function canonicalKindOfPage(page: Pick<PageEntry, 'slug' | 'title' | 'isHome' | 'detailOf' | 'kind'>): CanonicalKind | null {
  if (page.isHome || page.kind === 'home') return null
  if (page.detailOf === 'about' || page.detailOf === 'services' || page.detailOf === 'gallery') return page.detailOf
  if (page.kind === 'detail') return null
  return kindOfText(`${page.slug} ${page.title}`)
}

export const LEGACY_ALIASES: Record<string, CanonicalKind> = {
  about: 'about',
  hakkimizda: 'about',
  hakkinda: 'about',
  faq: 'faq',
  sss: 'faq',
  contact: 'contact',
  iletisim: 'contact',
  services: 'services',
  hizmetler: 'services',
  hizmetlerimiz: 'services',
  gallery: 'gallery',
  galeri: 'gallery',
}

/**
 * Where an old or alternative address of a canonical page now lives: `/about` on a
 * site whose About page is `/hakkimizda`. Null when the address is not a known alias,
 * the site has no live page of that kind, or that page already answers on this address.
 */
export function canonicalRedirectTarget(site: WebsiteSchema, requestedSlug: string): string | null {
  const wanted = requestedSlug.toLowerCase()
  const kind = LEGACY_ALIASES[wanted]
  if (!kind) return null
  for (const page of site.pages ?? []) {
    if (!page.slug || page.slug.toLowerCase() === wanted) continue
    if (canonicalKindOfPage(page) !== kind) continue
    if (findPublicPage(site, page.slug)) return `/${page.slug}`
  }
  return null
}

const KIND_ANCHOR: Record<CanonicalKind, string> = {
  about: '#about',
  services: '#services',
  faq: '#faq',
  contact: '#contact',
  gallery: '#gallery',
}

function rewriteHrefs<T>(value: T, rename: Map<string, string>, dropped: Map<string, string>): T {
  if (Array.isArray(value)) return value.map((v) => rewriteHrefs(v, rename, dropped)) as unknown as T
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'href' && typeof v === 'string') {
      out[key] = rewriteHref(v, rename, dropped)
    } else {
      out[key] = rewriteHrefs(v, rename, dropped)
    }
  }
  return out as T
}

function rewriteHref(href: string, rename: Map<string, string>, dropped: Map<string, string>): string {
  const match = href.match(/^\/([^/?#]+)(.*)$/)
  if (!match) return href
  const [, first, rest] = match
  const key = first.toLowerCase()
  const renamed = rename.get(key)
  if (renamed) return `/${renamed}${rest}`
  const anchor = dropped.get(key)
  if (anchor && (rest === '' || rest.startsWith('#') || rest.startsWith('?'))) return anchor
  return href
}

export function sectionsOfKind(site: Pick<WebsiteSchema, 'sections'>, kind: CanonicalKind): Section[] {
  const types = new Set<SectionType>(CANONICAL_SECTION_TYPES[kind])
  return site.sections.filter((s) => types.has(s.type) && !s.hidden).map((s) => JSON.parse(JSON.stringify(s)) as Section)
}

function rank(kind: CanonicalKind | null): number {
  return kind ? KEEP_PRIORITY[kind] : OTHER_PRIORITY
}

/**
 * Final pass over a freshly generated site's pages:
 *  - every canonical page gets its real address (`/hakkimizda`, `/sss`, `/iletisim`, ...),
 *  - a custom page shows only its own sections; a page with nothing to show is dropped,
 *  - one page per kind (the system page wins over a model-made duplicate),
 *  - the page count never exceeds the plan limit: lower-priority pages are left out and
 *    their content stays on the home page (links to them become home anchors).
 * Existing sites never pass through this; it only runs at generation time.
 */
export function finalizeGeneratedPages<T extends WebsiteSchema>(site: T, lang: Lang, pageLimit: number): T {
  const pages = site.pages ?? []
  if (pages.length === 0) return site
  const limit = Math.max(1, Math.min(pageLimit, SITE_PAGE_HARD_CAP))

  type Candidate = { page: PageEntry; kind: CanonicalKind | null; index: number }
  let candidates: Candidate[] = pages.map((page, index) => ({ page, kind: canonicalKindOfPage(page), index }))
  const home = candidates.find((c) => c.page.isHome === true || c.page.kind === 'home') ?? candidates[0]

  const dropped = new Map<string, string>()
  const drop = (c: Candidate) => {
    if (c.page.slug) dropped.set(c.page.slug.toLowerCase(), c.kind ? KIND_ANCHOR[c.kind] : '/')
  }

  // One page per kind; a system (detail) page beats a custom one.
  const winners = new Map<CanonicalKind, Candidate>()
  for (const c of candidates) {
    if (c === home || !c.kind) continue
    const current = winners.get(c.kind)
    const better = !current || (c.page.kind === 'detail' && current.page.kind !== 'detail')
    if (better) winners.set(c.kind, c)
  }
  candidates = candidates.filter((c) => {
    if (c === home || !c.kind || winners.get(c.kind) === c) return true
    drop(c)
    return false
  })

  // A custom page keeps only content that exists; an empty page is a dead end.
  candidates = candidates.filter((c) => {
    if (c === home || !c.kind || c.page.kind === 'detail') return true
    if (sectionsOfKind(site, c.kind).length > 0) return true
    drop(c)
    return false
  })

  // Plan limit: the home page plus the best-ranked pages that fit.
  const room = limit - 1
  const others = candidates.filter((c) => c !== home)
  if (others.length > room) {
    const keep = new Set(
      [...others].sort((a, b) => rank(a.kind) - rank(b.kind) || a.index - b.index).slice(0, room),
    )
    candidates = candidates.filter((c) => c === home || keep.has(c))
    for (const c of others) if (!keep.has(c)) drop(c)
  }

  // Dropped system pages must stay off, or normalization would bring them back.
  const droppedKinds = new Set(
    pages
      .filter((p) => !candidates.some((c) => c.page === p))
      .map((p) => p.detailOf)
      .filter((d): d is 'about' | 'services' => d === 'about' || d === 'services'),
  )
  const sections = site.sections.map((s) => {
    if ((s.type === 'about' || s.type === 'services') && droppedKinds.has(s.type) && 'detail' in s && s.detail) {
      return { ...s, detail: { ...s.detail, pageEnabled: false } } as Section
    }
    return s
  })

  // Canonical addresses and per-page content.
  const rename = new Map<string, string>()
  const taken: string[] = ['home']
  const finalPages: PageEntry[] = candidates.map((c) => {
    if (c === home) return c.page
    let next: PageEntry = c.page
    if (c.kind) {
      const slug = uniquePageSlug(CANONICAL_SLUGS[c.kind][lang], taken)
      if (c.page.slug && c.page.slug.toLowerCase() !== slug) rename.set(c.page.slug.toLowerCase(), slug)
      next = { ...next, slug }
      if (c.page.kind !== 'detail') next = { ...next, kind: 'custom', sections: sectionsOfKind(site, c.kind) }
    }
    taken.push(next.slug)
    return next
  })
  const homeSlug = home.page.slug || 'home'
  taken.push(homeSlug)

  const changed =
    finalPages.length !== pages.length ||
    finalPages.some((p, i) => p !== pages[i]) ||
    sections.some((s, i) => s !== site.sections[i])
  if (!changed) return site

  const result = { ...site, pages: finalPages, sections } as T
  return rewriteHrefs(result, rename, dropped)
}
