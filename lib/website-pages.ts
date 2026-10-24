import type { Section, SectionType, WebsiteSchema } from '@/lib/website-schema'
import { collectSlugRedirects } from '@/lib/page-slugs'
import { resolveAboutDetail } from '@/lib/section-detail'
import { collectServiceRedirects, resolveServices } from '@/lib/service-pages'
import { resolveGalleryPages, type ResolvedGalleryPages } from '@/lib/gallery-pages'
import { resolveTestimonials } from '@/lib/testimonials'
import { resolveReferences } from '@/lib/references'
import { resolveTeam } from '@/lib/team'

/** Whether a system page's public URL answers: its content exists and its switch is on. */
function detailPageLive(
  detailOf: PageItem['detailOf'],
  live: {
    aboutLive: boolean
    servicesLive: boolean
    gallery: ResolvedGalleryPages
    testimonialsLive: boolean
    referencesLive: boolean
    teamLive: boolean
  },
): boolean {
  if (detailOf === 'references') return live.referencesLive
  if (detailOf === 'team') return live.teamLive
  if (detailOf === 'services') return live.servicesLive
  if (detailOf === 'gallery') return live.gallery.gallery.active
  if (detailOf === 'videos') return live.gallery.videos.active
  if (detailOf === 'testimonials') return live.testimonialsLive
  return live.aboutLive
}

/**
 * Multi-page preview routing.
 * ---------------------------
 * The schema keeps a single flat `sections` array (the homepage) plus a `pages`
 * list. Rather than change that contract, we DERIVE each page's content from
 * the section types, so multi-page navigation works for every existing schema
 * — AI-generated or deterministic fallback — with no migration.
 *
 * The home page shows everything (unchanged single-page behavior). Each other
 * page shows the sections whose type belongs to that page's category, so
 * "Services", "About", "Portfolio" and "Contact" feel like real pages.
 */

export type PageItem = {
  slug: string
  title: string
  isHome: boolean
  detail?: boolean
  detailOf?: 'about' | 'services' | 'gallery' | 'videos' | 'testimonials' | 'references' | 'team'
  id?: string
  showInHeader?: boolean
  showInFooter?: boolean
  menuLabel?: string
  /** A detail page whose switch is off or whose text is unapproved: the public URL is a 404. */
  unpublished?: boolean
}

/**
 * Pages shown as header buttons. A section detail page ("Hakkımızda" long
 * form) is reached through its "Daha fazlası…" link, so it only becomes a
 * header button when the site already has a real multi-page menu; otherwise a
 * one-page site would silently lose its anchor menu.
 */
export function headerPageItems(items: PageItem[]): PageItem[] {
  const regular = items.filter((p) => !p.detail)
  return regular.length > 1 ? items : regular
}

type Category = 'products' | 'services' | 'about' | 'portfolio' | 'contact' | 'pricing' | 'team'

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  products: ['ürün', 'urun', 'product', 'mağaza', 'magaza', 'shop', 'store', 'kategori', 'category', 'koleksiyon', 'collection'],
  services: ['hizmet', 'service', 'çözüm', 'cozum', 'solution', 'menü', 'menu'],
  about: ['hakk', 'about', 'kurumsal', 'story', 'hikaye', 'biz kimiz'],
  portfolio: ['portf', 'galeri', 'gallery', 'proje', 'project', 'work', 'çalışma', 'calisma', 'referans'],
  contact: ['iletiş', 'iletis', 'contact', 'ulaş', 'ulas', 'rezerv', 'booking', 'randevu'],
  pricing: ['fiyat', 'pricing', 'paket', 'package', 'plan'],
  team: ['ekip', 'team', 'kadro', 'hekim', 'doctor', 'staff'],
}

const CATEGORY_SECTION_TYPES: Record<Category, SectionType[]> = {
  products: ['categories', 'products', 'gallery', 'features', 'cta'],
  services: ['services', 'features', 'pricing', 'process', 'cta'],
  about: ['about', 'stats', 'team', 'testimonials', 'process'],
  portfolio: ['portfolio', 'gallery', 'products', 'testimonials'],
  contact: ['contact', 'faq', 'cta'],
  pricing: ['pricing', 'faq', 'cta'],
  team: ['team', 'about', 'stats'],
}

/** At least one of these must exist for a category page to have real content. */
const CATEGORY_PRIMARY_TYPES: Record<Category, SectionType[]> = {
  products: ['categories', 'products'],
  services: ['services', 'pricing'],
  about: ['about', 'team'],
  portfolio: ['portfolio', 'gallery'],
  contact: ['contact'],
  pricing: ['pricing'],
  team: ['team', 'about'],
}

const ANCHOR_ALIASES: Record<string, SectionType> = {
  portfolio: 'portfolio',
  portfoy: 'portfolio',
  projects: 'portfolio',
  project: 'portfolio',
  projeler: 'portfolio',
  proje: 'portfolio',
  work: 'portfolio',
  works: 'portfolio',
  calismalar: 'portfolio',
  referanslar: 'portfolio',
  services: 'services',
  hizmetler: 'services',
  process: 'process',
  surec: 'process',
  about: 'about',
  hakkimizda: 'about',
  team: 'team',
  ekip: 'team',
  contact: 'contact',
  iletisim: 'contact',
  booking: 'contact',
  reservation: 'contact',
  rezervasyon: 'contact',
  randevu: 'contact',
  appointment: 'contact',
  gallery: 'gallery',
  galeri: 'gallery',
  faq: 'faq',
  sss: 'faq',
  sikcasorulansorular: 'faq',
  sikcasorulanlar: 'faq',
  features: 'features',
  ozellikler: 'features',
  testimonials: 'testimonials',
  yorumlar: 'testimonials',
  musteriyorumlari: 'testimonials',
  pricing: 'pricing',
  fiyatlar: 'pricing',
  fiyatlandirma: 'pricing',
  paketler: 'pricing',
  products: 'products',
  urunler: 'products',
  categories: 'categories',
  kategoriler: 'categories',
}

/**
 * Maps an anchor id written by the model (`#projects`, `#projeler`, ...) to the
 * section id the renderer actually emits (the section type, e.g. `portfolio`).
 * Returns null when the anchor has no known alias, so a missing section never
 * gets an invented target.
 */
export function canonicalSectionAnchor(id: string): SectionType | null {
  const folded = id
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]/g, '')
  return ANCHOR_ALIASES[folded] ?? null
}

/** Normalized page list with a guaranteed single home, home first. */
export function pageNavItems(site: WebsiteSchema): PageItem[] {
  const pages = site.pages ?? []
  if (pages.length === 0) {
    return [{ slug: 'home', title: site.meta.name, isHome: true }]
  }
  let homeFound = false
  const aboutLive = resolveAboutDetail(site)?.pageActive === true
  const servicesLive = resolveServices(site)?.pageActive === true
  const gallery = resolveGalleryPages(site)
  const testimonialsLive = resolveTestimonials(site).active
  const referencesLive = resolveReferences(site).active
  const teamLive = resolveTeam(site).active
  const items: PageItem[] = pages.map((p, i) => {
    const isHome = p.isHome === true || (!pages.some((x) => x.isHome) && i === 0)
    if (isHome) homeFound = true
    const live = detailPageLive(p.detailOf, { aboutLive, servicesLive, gallery, testimonialsLive, referencesLive, teamLive })
    return {
      slug: p.slug || `page-${i}`,
      title: p.title,
      isHome,
      ...(p.kind === 'detail' ? { detail: true, ...(p.detailOf ? { detailOf: p.detailOf } : {}), ...(live ? {} : { unpublished: true }) } : {}),
      ...(p.id ? { id: p.id } : {}),
      ...(p.showInHeader !== undefined ? { showInHeader: p.showInHeader } : {}),
      ...(p.showInFooter !== undefined ? { showInFooter: p.showInFooter } : {}),
      ...(p.menuLabel?.trim() ? { menuLabel: p.menuLabel.trim() } : {}),
    }
  })
  if (!homeFound && items[0]) items[0].isHome = true
  return items
}

export function homeSlug(site: WebsiteSchema): string {
  return pageNavItems(site).find((p) => p.isHome)?.slug ?? 'home'
}

function categoryForText(text: string): Category | null {
  const haystack = text.toLocaleLowerCase('tr')
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS) as [Category, string[]][]) {
    if (words.some((w) => haystack.includes(w))) return cat
  }
  return null
}

function categoryFor(page: PageItem): Category | null {
  return categoryForText(`${page.slug} ${page.title}`)
}

/** Last non-empty path segment of an internal href, folded for comparison. */
function hrefToken(href: string): string {
  const clean = href.split('?')[0].split('#')[0].replace(/\/+$/, '')
  const seg = clean.split('/').filter(Boolean).pop() ?? ''
  return seg.toLocaleLowerCase('tr')
}

/**
 * Converts an internal href into the tenant-relative path used on the live
 * `<slug>.gloval.site` store, so the preview can open the real page in a new
 * tab. A product card's href is `/site/<slug>/store/<x>`; the tenant site
 * serves that as `/store/<x>` (middleware adds the `/site/<slug>` prefix), so
 * we strip that prefix. Any other internal href passes through unchanged.
 */
export function hrefToTenantPath(href: string, slug: string | null): string {
  const path = (href || '').trim() || '/'
  if (slug) {
    const prefix = `/site/${slug}`
    if (path === prefix) return '/'
    if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length)
  }
  return path.startsWith('/') ? path : `/${path}`
}

/**
 * Resolves an internal href to one of this site's page slugs for IN-MEMORY
 * navigation, or null when the href points at something that is not a page
 * (a product-detail route, the cart, an external URL, ...).
 *
 * The generated site switches pages in-memory, but its links/CTAs/cards still
 * carry real `/route` hrefs; the renderer uses this to turn "/urunler" (or
 * "/products", or "/site/x/urunler") into a page switch instead of a real
 * navigation that would dead-end in the editor preview iframe. Matching is by
 * exact slug first, then by shared page category so Turkish and English route
 * spellings both resolve.
 */
export function resolveHrefToPageSlug(site: WebsiteSchema, href: string): string | null {
  const trimmed = (href || '').trim()
  if (!trimmed || !trimmed.startsWith('/')) return null
  // A bare "/" is always the home page.
  if (trimmed === '/') return homeSlug(site)

  const items = pageNavItems(site)
  const target = hrefToken(trimmed)
  if (!target) return null

  const direct = items.find((p) => p.slug.toLocaleLowerCase('tr') === target)
  if (direct) return direct.slug

  const cat = categoryForText(target)
  if (cat) {
    const byCat = items.find((p) => categoryFor(p) === cat)
    if (byCat) return byCat.slug
  }
  return null
}

/** URL path of a page on the tenant host: the home page is `/`, others `/<slug>`. */
export function pagePath(site: WebsiteSchema, slug: string): string {
  return slug === homeSlug(site) ? '/' : `/${slug}`
}

/** A page is indexed unless the owner switched it off. */
export function isPageIndexable(page: { indexable?: boolean }): boolean {
  return page.indexable !== false
}

/**
 * Resolves the first path segment of a tenant URL to a real, non-home page.
 * The home slug is intentionally NOT resolvable (the home page lives at `/`),
 * so `/home` stays a 404 instead of duplicating the homepage.
 */
export function findPublicPage(site: WebsiteSchema, pathSlug: string) {
  const wanted = pathSlug.toLowerCase()
  const home = homeSlug(site)
  // A detail page is public only while its switch is on and its text is approved:
  // `stripSampleContent` turns the switch off for unapproved text, so it 404s.
  const aboutLive = resolveAboutDetail(site)?.pageActive === true
  const servicesLive = resolveServices(site)?.pageActive === true
  const gallery = resolveGalleryPages(site)
  const testimonialsLive = resolveTestimonials(site).active
  const referencesLive = resolveReferences(site).active
  const teamLive = resolveTeam(site).active
  return (
    (site.pages ?? []).find((p, i) => {
      const slug = p.slug || `page-${i}`
      if (slug.toLowerCase() !== wanted || slug === home) return false
      if (p.kind === 'detail') return detailPageLive(p.detailOf, { aboutLive, servicesLive, gallery, testimonialsLive, referencesLive, teamLive })
      // A page with no content of its own is a 404 (never home or another page's content).
      return pageHasContent(site, slug)
    }) ?? null
  )
}

/**
 * One-time upgrade of a schema saved before pages owned their content: every
 * non-home page gets its own `sections` (copied from what the category rules
 * used to derive), so editing one page can never change another. Pages that
 * already own sections are left untouched, so the function is idempotent.
 */
export function materializePages(site: WebsiteSchema): WebsiteSchema {
  const pages = site.pages ?? []
  if (pages.length === 0) return site
  const home = homeSlug(site)
  let changed = false
  const next = pages.map((page, i) => {
    const slug = page.slug || `page-${i}`
    if (slug === home) {
      if (page.kind) return page
      changed = true
      return { ...page, kind: 'home' as const }
    }
    if (page.sections && page.sections.length > 0) return page
    const derived = sectionsForPage({ ...site, pages: pages.map((p) => ({ ...p, sections: undefined })) }, slug)
      .filter((s) => s.type !== 'footer')
      .map((s) => JSON.parse(JSON.stringify(s)) as Section)
    if (derived.length === 0) return page
    changed = true
    return { ...page, kind: page.kind ?? ('custom' as const), sections: derived }
  })
  return changed ? { ...site, pages: next } : site
}

const MAX_PAGE_REDIRECTS = 60

/**
 * Keeps `pageRedirects` in step with page renames: a page whose slug changed
 * since `previousPages` leaves a permanent redirect behind, older redirects are
 * retargeted to the newest slug (no chains), and a redirect whose old path is a
 * live page again is dropped.
 */
export function withPageRedirects(
  next: WebsiteSchema,
  previousPages: Array<{ slug: string; isHome?: boolean }> | undefined,
  previousSite?: WebsiteSchema | null,
): WebsiteSchema {
  const pages = next.pages ?? []
  const created = [...collectSlugRedirects(previousPages ?? [], pages), ...collectServiceRedirects(previousSite, next)]
  const live = new Set(pages.map((p, i) => p.slug || `page-${i}`))
  const services = resolveServices(next)
  const liveServicePaths = new Set(
    services?.pageActive ? services.items.map((i) => `/${services.listSlug}/${i.slug}`) : [],
  )
  const isLive = (path: string) =>
    path.replace(/^\//, '').includes('/') ? liveServicePaths.has(path) : live.has(path.replace(/^\//, ''))
  const byFrom = new Map<string, string>()
  for (const r of next.pageRedirects ?? []) byFrom.set(r.from, r.to)
  for (const r of created) {
    for (const [from, to] of byFrom) if (to === r.from) byFrom.set(from, r.to)
    byFrom.set(r.from, r.to)
  }
  const merged = Array.from(byFrom, ([from, to]) => ({ from, to }))
    .filter((r) => r.from !== r.to && !isLive(r.from) && isLive(r.to))
    .slice(-MAX_PAGE_REDIRECTS)
  const unchanged =
    merged.length === (next.pageRedirects?.length ?? 0) &&
    merged.every((r, i) => next.pageRedirects?.[i]?.from === r.from && next.pageRedirects?.[i]?.to === r.to)
  if (unchanged) return next
  return { ...next, pageRedirects: merged.length > 0 ? merged : undefined }
}

/**
 * Returns the visible sections to render for the active page. Hidden sections
 * are always filtered out. A trailing footer is always preserved.
 *
 * A non-home page that owns `sections` renders exactly those (plus the shared
 * footer). Pages without their own sections fall back to the category rules,
 * which keeps schemas saved before real pages existed rendering as before.
 */
export function sectionsForPage(
  site: WebsiteSchema,
  activeSlug: string,
): Section[] {
  const visible = site.sections.filter((s) => !s.hidden)
  const items = pageNavItems(site)
  const active = items.find((p) => p.slug === activeSlug) ?? items[0]

  // Single-page sites, or the home page: show the full homepage unchanged.
  if (items.length <= 1 || !active || active.isHome) return visible

  const footer = visible.filter((s) => s.type === 'footer')

  // A section detail page draws its own body (SectionDetailPage); only the
  // shared footer comes from the section list.
  if (active.detail) return footer

  const own = (site.pages ?? []).find((p, i) => (p.slug || `page-${i}`) === active.slug)
  if (own?.sections && own.sections.length > 0) {
    return [...own.sections.filter((s) => !s.hidden && s.type !== 'footer'), ...footer]
  }

  // A page without sections of its own shows only what its category defines.
  // It NEVER falls back to the home page or to another page's content: a page
  // with nothing to show renders just the footer and is not publicly served
  // (see `pageHasContent`). The old fallbacks ("unknown category -> whole home
  // page", "contact -> FAQ when there is no contact section") are what made
  // /faq show the home page and /contact show the FAQ.
  const category = categoryFor(active)
  if (!category) return footer

  const allowed = new Set(CATEGORY_SECTION_TYPES[category])
  const matched = visible.filter((s) => allowed.has(s.type) && s.type !== 'footer')
  const primary = new Set(CATEGORY_PRIMARY_TYPES[category])
  if (!matched.some((s) => primary.has(s.type))) return footer

  return [...matched, ...footer]
}

/**
 * Whether a non-home page has content of its own to serve. Section detail pages
 * draw their own body and are gated separately (`detailPageLive`); every other
 * page needs at least one visible, non-footer section.
 */
export function pageHasContent(site: WebsiteSchema, slug: string): boolean {
  const page = (site.pages ?? []).find((p, i) => (p.slug || `page-${i}`) === slug)
  if (page?.kind === 'detail') return true
  return sectionsForPage(site, slug).some((s) => s.type !== 'footer')
}
