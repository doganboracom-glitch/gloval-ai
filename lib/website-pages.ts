import type { Section, SectionType, WebsiteSchema } from '@/lib/website-schema'

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

export type PageItem = { slug: string; title: string; isHome: boolean }

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
  const items: PageItem[] = pages.map((p, i) => {
    const isHome = p.isHome === true || (!pages.some((x) => x.isHome) && i === 0)
    if (isHome) homeFound = true
    return { slug: p.slug || `page-${i}`, title: p.title, isHome }
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

/**
 * Returns the visible sections to render for the active page. Hidden sections
 * are always filtered out. A trailing footer is always preserved.
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

  const category = categoryFor(active)
  const footer = visible.filter((s) => s.type === 'footer')

  if (!category) {
    // Unknown page category: show the full homepage so the page is never empty.
    return visible
  }

  const allowed = new Set(CATEGORY_SECTION_TYPES[category])
  const matched = visible.filter((s) => allowed.has(s.type) && s.type !== 'footer')

  // Sub-pages lead with their OWN content (no repeated hero) so navigating
  // visibly changes the page. Fall back to all non-hero/footer sections if the
  // category matched nothing, so a page is never blank.
  const body =
    matched.length > 0
      ? matched
      : visible.filter((s) => s.type !== 'footer' && s.type !== 'hero')

  return [...body, ...footer]
}
