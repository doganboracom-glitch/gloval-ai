import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { isUsableImageSrc } from '@/lib/about-media'
import { cleanDetailBlocks, syncDetailPages, type DetailBlock } from '@/lib/section-detail'
import { slugifyPageSlug, uniquePageSlug } from '@/lib/page-slugs'
import { SERVICE_ITEM_LIMITS } from '@/lib/service-item-limits'
import { syncGalleryPages } from '@/lib/gallery-pages'
import { syncTestimonialsPage } from '@/lib/testimonials'
import { syncReferencesPage } from '@/lib/references'
import { syncTeamPage } from '@/lib/team'

/**
 * Service pages
 * -------------
 * The home `services` section can own a LIST page (`/hizmetlerimiz`, a
 * `kind: 'detail'`, `detailOf: 'services'` page that is only the route) and one
 * item page per service (`/hizmetlerimiz/<slug>`). Content lives on the section
 * (`items[].slug|src|alt|detail`, `section.detail`), so a service and its pages
 * stay one owner-editable unit. Everything here is pure and shared by the
 * renderer, editor, sitemap and public routes. Nothing is invented: an item
 * without its own text shows the description it already has.
 */

type Lang = 'tr' | 'en'
export type ServicesData = Extract<Section, { type: 'services' }>
export type ServiceItem = ServicesData['items'][number]

const LIST_SLUGS: Record<Lang, string> = { tr: 'hizmetlerimiz', en: 'services' }
const LIST_TITLES: Record<Lang, string> = { tr: 'Hizmetlerimiz', en: 'Our services' }
const LINK_LABELS: Record<Lang, string> = { tr: 'Tüm hizmetlerimiz', en: 'All our services' }
const ITEM_LINK_LABELS: Record<Lang, string> = { tr: 'Detayları incele', en: 'View details' }

export const MAX_SERVICE_ITEM_SLUG = SERVICE_ITEM_LIMITS.slug

const siteLang = (site: Pick<WebsiteSchema, 'meta'>): Lang => (site.meta.language === 'en' ? 'en' : 'tr')

export function defaultServicesLinkLabel(lang: Lang): string {
  return LINK_LABELS[lang]
}
export function defaultServiceItemLinkLabel(lang: Lang): string {
  return ITEM_LINK_LABELS[lang]
}
export function servicesListTitle(lang: Lang): string {
  return LIST_TITLES[lang]
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

const SERVICES_PAGE_WORDS = new Set(['hizmetler', 'hizmetlerimiz', 'hizmet', 'services', 'our services', 'service'])

function looksLikeServicesPage(page: { slug: string; title: string }): boolean {
  return SERVICES_PAGE_WORDS.has(fold(page.slug)) || SERVICES_PAGE_WORDS.has(fold(page.title))
}

export function findServicesSection(site: Pick<WebsiteSchema, 'sections'>): ServicesData | null {
  return (site.sections.find((s) => s.type === 'services') as ServicesData | undefined) ?? null
}

export function findServicesPage(site: Pick<WebsiteSchema, 'pages'>) {
  return (site.pages ?? []).find((p) => p.kind === 'detail' && p.detailOf === 'services') ?? null
}

/** Slug an item would get from its title (never empty). */
export function serviceSlugFromTitle(title: string): string {
  return slugifyPageSlug(title).slice(0, MAX_SERVICE_ITEM_SLUG) || 'hizmet'
}

/** Normalizes an owner-typed item slug; falls back to the title. */
export function cleanServiceSlug(value: string | undefined, title: string): string {
  // slugifyPageSlug('') returns the generic 'sayfa', so an empty value must be handled before it.
  if (!value?.trim()) return serviceSlugFromTitle(title)
  return slugifyPageSlug(value).slice(0, MAX_SERVICE_ITEM_SLUG) || serviceSlugFromTitle(title)
}

/**
 * Gives every item a unique, stable slug. Existing valid slugs are kept (so
 * renaming a title never silently moves an indexed URL); duplicates and missing
 * ones are derived from the title. Returns the same array when nothing changes.
 */
export function withServiceSlugs(items: ServiceItem[]): ServiceItem[] {
  const taken = new Set<string>()
  let changed = false
  const next = items.map((item) => {
    const wanted = cleanServiceSlug(item.slug, item.title)
    const slug = taken.has(wanted) ? uniquePageSlug(wanted, taken) : wanted
    taken.add(slug)
    if (slug === item.slug) return item
    changed = true
    return { ...item, slug }
  })
  return changed ? next : items
}

export type ServiceEntry = {
  slug: string
  title: string
  description: string
  icon?: string
  image: { src: string; alt: string } | null
  blocks: DetailBlock[]
  /** False when the owner turned this service's own page off (the card stays). */
  pageEnabled: boolean
  seoTitle?: string
  seoDescription?: string
  /** Platform-written text the owner has not approved yet. */
  sample: boolean
}

export type ResolvedServices = {
  cta: { title: string; text: string; label: string }
  section: ServicesData
  /** True when the pages are on, the section is visible and the list page exists. */
  pageActive: boolean
  listSlug: string
  listTitle: string
  heading: string
  itemLinkLabel: string
  /** "Tüm hizmetlerimiz" link under the home section, or null when it must not show. */
  link: { label: string; href: string } | null
  items: ServiceEntry[]
}

export function toServiceEntry(item: ServiceItem, fallbackAlt?: string): ServiceEntry {
  const image = isUsableImageSrc(item.src)
    ? { src: (item.src as string).trim(), alt: item.alt?.trim() || fallbackAlt || item.title }
    : null
  return {
    slug: item.slug || serviceSlugFromTitle(item.title),
    title: item.title,
    description: item.description,
    icon: item.icon,
    image,
    blocks: cleanDetailBlocks(item.detail),
    pageEnabled: item.pageEnabled !== false,
    seoTitle: item.seoTitle?.trim() || undefined,
    seoDescription: item.seoDescription?.trim() || undefined,
    sample: item.sample === true,
  }
}

const CTA_DEFAULTS = {
  tr: (name: string) => ({
    title: `${name} ile görüşün`,
    text: 'İhtiyacınızı bize iletin, size geri dönelim.',
    label: 'İletişime geçin',
  }),
  en: (name: string) => ({
    title: `Talk to ${name}`,
    text: 'Tell us what you need and we will get back to you.',
    label: 'Get in touch',
  }),
}

/** The closing contact card: the owner's wording, else the neutral default. */
export function resolveServicesCta(
  site: Pick<WebsiteSchema, 'meta'>,
  detail: NonNullable<ServicesData['detail']> | undefined,
) {
  const base = CTA_DEFAULTS[siteLang(site)](site.meta.name)
  return {
    title: detail?.ctaTitle?.trim() || base.title,
    text: detail?.ctaText?.trim() || base.text,
    label: detail?.ctaLabel?.trim() || base.label,
  }
}

export type ServiceDetailHint = 'none' | 'published'

/**
 * Persistent editor suggestion for sites that were published before service
 * pages existed. Pure and read-only: the live output never changes until the
 * owner accepts. Closed for good by `dismissHint: 'serviceDetail'`.
 */
export function serviceDetailHint(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'dismissedHints'>,
  published: boolean,
): ServiceDetailHint {
  if (!published) return 'none'
  const section = findServicesSection(site)
  if (!section || section.hidden || section.detail) return 'none'
  if ((site.dismissedHints ?? []).includes('serviceDetail')) return 'none'
  return 'published'
}

/** null when the site has no services section with the pages configured. */
export function resolveServices(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
): ResolvedServices | null {
  const section = findServicesSection(site)
  if (!section?.detail) return null
  const lang = siteLang(site)
  const page = findServicesPage(site)
  const pageActive = !section.hidden && section.detail.pageEnabled !== false && !!page
  const listSlug = page?.slug || LIST_SLUGS[lang]
  const label = section.detail.linkLabel?.trim() || LINK_LABELS[lang]
  const slugged = withServiceSlugs(section.items)
  return {
    cta: resolveServicesCta(site, section.detail),
    section,
    pageActive,
    listSlug,
    listTitle: page?.title || LIST_TITLES[lang],
    heading: section.detail.heading?.trim() || section.title,
    itemLinkLabel: ITEM_LINK_LABELS[lang],
    link: pageActive && section.detail.linkEnabled !== false ? { label, href: `/${listSlug}` } : null,
    items: slugged.map((i) => toServiceEntry(i)),
  }
}

export function servicePath(listSlug: string, itemSlug: string): string {
  return `/${listSlug}/${itemSlug}`
}

/** Splits `/<listSlug>/<itemSlug>` (query/hash ignored) when it addresses a live service page. */
export function matchServiceHref(
  site: WebsiteSchema,
  href: string,
): { listSlug: string; itemSlug: string } | null {
  const path = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')
  const [listSlug, itemSlug, ...rest] = path.split('/')
  if (!listSlug || !itemSlug || rest.length > 0) return null
  const found = findPublicService(site, listSlug, itemSlug)
  return found ? { listSlug, itemSlug: found.entry.slug } : null
}

/** The service behind `/<listSlug>/<itemSlug>`, only while its pages are live. */
export function findPublicService(site: WebsiteSchema, listSlug: string, itemSlug: string) {
  const resolved = resolveServices(site)
  if (!resolved?.pageActive || resolved.listSlug.toLowerCase() !== listSlug.toLowerCase()) return null
  const wanted = itemSlug.toLowerCase()
  const index = resolved.items.findIndex((i) => i.slug.toLowerCase() === wanted)
  if (index < 0 || !resolved.items[index].pageEnabled) return null
  return { resolved, entry: resolved.items[index], index }
}

/** Plain-text digest for meta descriptions; the owner's SEO text wins. */
export function serviceDescription(entry: ServiceEntry): string {
  if (entry.seoDescription) return entry.seoDescription.slice(0, SERVICE_ITEM_LIMITS.seoDescription)
  const firstBlock = entry.blocks.find((b) => b.body)?.body
  const source = firstBlock || entry.description
  return source.replace(/\s+/g, ' ').trim().slice(0, 160)
}

/**
 * Keeps the `pages` list in step with the services section's `detail`:
 *  - detail on  -> exactly one `kind: 'detail'`/`detailOf: 'services'` page (an
 *    existing bare "Hizmetler" page is adopted instead of creating a duplicate)
 *    and every item has a unique slug;
 *  - detail off / section hidden or removed -> that page is dropped.
 * A new page counts toward the plan page limit; adopting never adds one.
 * Idempotent; returns the same object when nothing changes.
 */
export function syncServicesPage<T extends WebsiteSchema>(site: T, pageLimit: number = SITE_PAGE_HARD_CAP): T {
  const section = findServicesSection(site)
  const wanted = !!section?.detail && !section.hidden && section.detail.pageEnabled !== false
  const pages = site.pages ?? []
  const existing = findServicesPage(site)

  if (!wanted) {
    if (!existing) return site
    return { ...site, pages: pages.filter((p) => p !== existing) }
  }

  let next: T = site
  if (section) {
    const items = withServiceSlugs(section.items)
    if (items !== section.items) {
      next = { ...site, sections: site.sections.map((s) => (s === section ? { ...section, items } : s)) }
    }
  }
  if (existing) return next

  const lang = siteLang(site)
  const adopt = pages.find(
    (p) =>
      !p.isHome &&
      p.kind !== 'detail' &&
      looksLikeServicesPage(p) &&
      (p.sections ?? []).every((s) => s.type === 'services' || s.type === 'footer'),
  )
  if (adopt) {
    return {
      ...next,
      pages: pages.map((p) =>
        p === adopt ? { ...p, kind: 'detail' as const, detailOf: 'services' as const, sections: undefined } : p,
      ),
    }
  }
  if (pages.length >= Math.min(pageLimit, SITE_PAGE_HARD_CAP)) return next

  const taken = new Set(pages.map((p) => (p.slug || '').toLowerCase()))
  const slug = taken.has(LIST_SLUGS[lang]) ? uniquePageSlug(LIST_SLUGS[lang], taken) : LIST_SLUGS[lang]
  const created = { slug, title: LIST_TITLES[lang], kind: 'detail' as const, detailOf: 'services' as const }
  const base = pages.length === 0 ? [{ slug: 'home', title: site.meta.name, isHome: true }] : pages
  return { ...next, pages: [...base, created] }
}

/**
 * Switches the pages on for a freshly generated site (the owner can turn them
 * off in the editor). A no-op when the site has no services section or already
 * carries a `detail` choice.
 */
export function seedServicesDetail<T extends Pick<WebsiteSchema, 'sections' | 'meta'>>(site: T): T {
  const section = findServicesSection(site)
  if (!section || section.detail) return site
  const lang = siteLang(site)
  const items = withServiceSlugs(section.items)
  return {
    ...site,
    sections: site.sections.map((s) =>
      s === section
        ? { ...section, items, detail: { linkEnabled: true, pageEnabled: true, linkLabel: LINK_LABELS[lang] } }
        : s,
    ),
  }
}

/**
 * Permanent redirects for service URLs whose slug changed between two saves,
 * matched by item position. Returns `/<list>/<old>` -> `/<list>/<new>` pairs.
 */
export function collectServiceRedirects(
  previous: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'> | null | undefined,
  next: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
): Array<{ from: string; to: string }> {
  if (!previous) return []
  const before = findServicesSection(previous)
  const after = resolveServices(next)
  if (!before || !after?.pageActive) return []
  const previousList = findServicesPage(previous)?.slug
  const out: Array<{ from: string; to: string }> = []
  const old = withServiceSlugs(before.items)
  after.items.forEach((entry, i) => {
    const was = old[i]?.slug
    if (!was || was === entry.slug) return
    const from = servicePath(previousList ?? after.listSlug, was)
    const to = servicePath(after.listSlug, entry.slug)
    if (from !== to) out.push({ from, to })
  })
  return out
}

/** Keeps every section detail page (about + services) in step with its section. */
export function syncSectionPages<T extends WebsiteSchema>(site: T, pageLimit: number = SITE_PAGE_HARD_CAP): T {
  return syncTeamPage(
    syncReferencesPage(
      syncTestimonialsPage(
        syncGalleryPages(syncServicesPage(syncDetailPages(site, pageLimit), pageLimit), pageLimit),
        pageLimit,
      ),
      pageLimit,
    ),
    pageLimit,
  )
}
