import type { NavLink, WebsiteSchema } from '@/lib/website-schema'
import { headerPageItems, pageNavItems, type PageItem } from '@/lib/website-pages'
import { NAV_LINK_MAX } from '@/lib/pricing-config'
import { isProductsLink } from '@/lib/store-header-links'

/** The header holds at most this many entries; the editor blocks switching on more. */
export const MENU_MAX = 7

/** Key of the blog entry in `navigation.menuOrder` and in the resolved list. */
export const BLOG_MENU_KEY = 'blog'

/** One single-level sub-menu item (a product category under "Ürünler"). */
export type MenuChild = {
  key: string
  label: string
  href: string
  /** Slug of the site page the child points at (page children only), so the parent can light up while it is open. */
  pageSlug?: string
}

/** A product category the header can list under the products entry. */
export type MenuCategory = { key: string; label: string; href: string }

/** Sub-menu only appears from this many categories on; one category adds nothing over the entry itself. */
export const SUBMENU_MIN_CATEGORIES = 2

export type MenuEntry =
  | { kind: 'page'; key: string; label: string; page: PageItem; children?: MenuChild[] }
  | { kind: 'link'; key: string; label: string; link: NavLink; children?: MenuChild[] }
  | { kind: 'blog'; key: string; label: string; children?: MenuChild[] }

/** Whether this entry is the product list entry (the one that can own category children). */
export function isProductsEntry(entry: MenuEntry): boolean {
  if (entry.kind === 'blog') return false
  if (entry.kind === 'link') return isProductsLink(entry.link.label, entry.link.href)
  return isProductsLink(entry.page.title)
}

/**
 * Hands the categories to the products entry as its children. `enabled` is
 * OPT-IN: only an explicit `true` shows the sub-menu, so a site saved before the
 * feature (undefined) renders exactly the HTML it always did. New sites get
 * `true` seeded (`seedProductsSubmenu`), unpublished drafts get it when loaded.
 * Only the first products entry gets children and only when 2+ categories exist.
 */
export function withProductChildren(
  entries: MenuEntry[],
  categories: MenuCategory[] | undefined,
  enabled: boolean | undefined,
): MenuEntry[] {
  if (enabled !== true || !categories || categories.length < SUBMENU_MIN_CATEGORIES) return entries
  let done = false
  return entries.map((entry) => {
    if (done || !isProductsEntry(entry)) return entry
    done = true
    return { ...entry, children: categories.map((c) => ({ key: c.key, label: c.label, href: c.href })) }
  })
}

/**
 * "Galeri" gets a two-item sub-menu (Resimler, Videolar) as soon as the site has a live /videolar page: the owner
 * never has to add "Videolar" to the menu by hand. A separate "Videolar" entry (switched on in the pages panel)
 * folds into the sub-menu instead of repeating. `allPages` is the full page list, so the videos page is found even
 * when it is not a menu entry. With only one of the two live, nothing changes: that page is a plain entry.
 */
export function withGalleryChildren(
  entries: MenuEntry[],
  hrefOf: (page: PageItem) => string,
  allPages?: PageItem[],
): MenuEntry[] {
  const gallery = entries.find((e) => e.kind === 'page' && e.page.detailOf === 'gallery')
  if (!gallery || gallery.kind !== 'page') return entries
  const listed = entries.find((e) => e.kind === 'page' && e.page.detailOf === 'videos')
  const listedPage = listed && listed.kind === 'page' ? listed : undefined
  const unlisted = allPages?.find((p) => p.detailOf === 'videos' && isLinkable(p))
  const videosPage = listedPage?.page ?? unlisted
  if (!videosPage) return entries
  const english = videosPage.title === 'Videos'
  const children: MenuChild[] = [
    {
      key: `${gallery.key}:photos`,
      label: english ? 'Photos' : 'Resimler',
      href: hrefOf(gallery.page),
      pageSlug: gallery.page.slug,
    },
    {
      key: `${pageMenuKey(videosPage)}:videos`,
      label: listedPage?.label ?? pageMenuLabel(videosPage),
      href: hrefOf(videosPage),
      pageSlug: videosPage.slug,
    },
  ]
  return entries.filter((e) => e !== listedPage).map((e) => (e === gallery ? { ...gallery, children } : e))
}

/** Turns the sub-menu on for a site that has never made a choice (new generations, unpublished drafts). */
export function seedProductsSubmenu<T extends Pick<WebsiteSchema, 'navigation'>>(site: T): T {
  if (site.navigation.productsSubmenu !== undefined) return site
  return { ...site, navigation: { ...site.navigation, productsSubmenu: true } }
}

/** Children of the products entry, for the menu layout panel. */
export function productsEntryChildren(entries: MenuEntry[]): MenuChild[] {
  return entries.find((e) => e.children && e.children.length > 0)?.children ?? []
}

/** Identity of a page in the menu: its id, falling back to the slug for pages without one. */
export function pageMenuKey(page: Pick<PageItem, 'id' | 'slug'>): string {
  return page.id ?? page.slug
}

export function pageMenuLabel(page: Pick<PageItem, 'menuLabel' | 'title'>): string {
  return page.menuLabel?.trim() || page.title
}

/** Pages that can never be a menu entry: a detail page whose public URL is a 404. */
function isLinkable(page: PageItem): boolean {
  return !page.unpublished
}

/**
 * The ordered header menu. Without any menu fields on the site this is exactly
 * what the header always showed: the pages (multi-page site) or the anchor links
 * (one-page site), then the blog link. The owner's switches, labels and order are
 * layered on top of that.
 */
export function resolveHeaderMenu({
  pages,
  links,
  blog,
  blogLabel,
  menuOrder,
  rawPages = false,
}: {
  /** Store sub-routes list every page as given, with no one-page-site filtering. */
  rawPages?: boolean
  /** `pageNavItems(site)`, or any subset the surface can reach. */
  pages: PageItem[] | undefined
  /** `navigation.links` without hand-written blog links. */
  links: NavLink[]
  blog: boolean
  blogLabel: string
  menuOrder?: string[]
}): MenuEntry[] {
  const all = pages ?? []
  const base = rawPages ? all : headerPageItems(all)
  const multiPage = base.length > 1

  const entries: MenuEntry[] = multiPage
    ? base.filter(isLinkable).map((page) => ({ kind: 'page', key: pageMenuKey(page), label: pageMenuLabel(page), page }))
    : links.map((link) => ({ kind: 'link', key: `link:${link.label}${link.href}`, label: link.label, link }))

  const hidden = new Set(all.filter((p) => p.showInHeader === false).map(pageMenuKey))
  const present = new Set(entries.map((e) => e.key))
  for (const page of all) {
    if (page.showInHeader !== true || present.has(pageMenuKey(page)) || !isLinkable(page)) continue
    entries.push({ kind: 'page', key: pageMenuKey(page), label: pageMenuLabel(page), page })
  }

  const visible = entries.filter((e) => !(e.kind === 'page' && hidden.has(e.key)))
  if (blog) visible.push({ kind: 'blog', key: BLOG_MENU_KEY, label: blogLabel })

  if (!menuOrder || menuOrder.length === 0) return visible
  const rank = (entry: MenuEntry): number => {
    if (entry.kind === 'link') return -1
    const index = menuOrder.indexOf(entry.key)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }
  return visible
    .map((entry, position) => ({ entry, position }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.position - b.position)
    .map(({ entry }) => entry)
}

/**
 * The pages the owner switched on for the footer, in menu order. Footer is
 * opt-in: a page with no `showInFooter` is not listed, so existing footers do
 * not change.
 */
export function resolveFooterPages(pages: PageItem[] | undefined, menuOrder?: string[]): PageItem[] {
  const picked = (pages ?? []).filter((p) => p.showInFooter === true && isLinkable(p))
  const ordered = (() => {
    if (!menuOrder || menuOrder.length === 0) return picked
    const rank = (p: PageItem) => {
      const index = menuOrder.indexOf(pageMenuKey(p))
      return index < 0 ? Number.MAX_SAFE_INTEGER : index
    }
    return picked.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p)
  })()
  return withFooterVideos(ordered, pages)
}

/**
 * Same rule as the header sub-menu: a footer that lists "Galeri" also lists the live "Videolar" page right after
 * it, so the footer never links the photos while hiding the videos the header offers.
 */
function withFooterVideos(picked: PageItem[], pages: PageItem[] | undefined): PageItem[] {
  const galleryAt = picked.findIndex((p) => p.detailOf === 'gallery')
  if (galleryAt < 0 || picked.some((p) => p.detailOf === 'videos')) return picked
  const videos = (pages ?? []).find((p) => p.detailOf === 'videos' && isLinkable(p))
  if (!videos) return picked
  return [...picked.slice(0, galleryAt + 1), videos, ...picked.slice(galleryAt + 1)]
}

export type MenuGapKind = 'about' | 'services' | 'contact'

const DEFAULT_MENU_KINDS: MenuGapKind[] = ['about', 'services', 'contact']

const GAP_WORDS: Record<MenuGapKind, RegExp> = {
  about: /hakkimizda|hakkinda|about/,
  services: /hizmet|services/,
  contact: /iletisim|contact/,
}

const GAP_LABELS: Record<MenuGapKind, { tr: string; en: string }> = {
  about: { tr: 'Hakkımızda', en: 'About' },
  services: { tr: 'Hizmetlerimiz', en: 'Services' },
  contact: { tr: 'İletişim', en: 'Contact' },
}

const GAP_SECTION: Record<MenuGapKind, 'about' | 'services' | 'contact'> = {
  about: 'about',
  services: 'services',
  contact: 'contact',
}

function foldText(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u')
}

export type MenuGap = { kind: MenuGapKind; target: { type: 'page'; pageIndex: number } | { type: 'link' } }

function candidatePageIndex(site: WebsiteSchema, kind: MenuGapKind): number {
  const pages = site.pages ?? []
  const items = pageNavItems(site)
  return pages.findIndex((p, i) => {
    if (p.isHome) return false
    if (kind === 'contact') return p.kind !== 'detail' && p.kind !== 'legal' && GAP_WORDS.contact.test(foldText(`${p.slug} ${p.title}`))
    return p.kind === 'detail' && p.detailOf === kind && !items[i]?.unpublished
  })
}

/**
 * The default entries (About, Services, Contact) the header lacks although the
 * site has something to point at: a live page (switched on by `showInHeader`) or,
 * on a one-page site, the section's anchor in `navigation.links`. An entry is
 * skipped when the header already has it, the owner switched it off on purpose,
 * there is nothing to point at, or the header is already at `MENU_MAX` - so
 * adding never pushes an existing menu past the cap.
 */
export function findMenuGaps(site: WebsiteSchema, kinds: MenuGapKind[] = DEFAULT_MENU_KINDS): MenuGap[] {
  const pages = pageNavItems(site)
  const entries = resolveHeaderMenu({ pages, links: site.navigation.links, blog: false, blogLabel: '', menuOrder: site.navigation.menuOrder })
  let count = entries.length
  let links = site.navigation.links.length
  const multiPage = headerPageItems(pages).length > 1
  const gaps: MenuGap[] = []
  for (const kind of kinds) {
    if (count >= MENU_MAX) break
    const present = entries.some((e) => GAP_WORDS[kind].test(foldText(`${e.label} ${e.kind === 'link' ? e.link.href : ''} ${e.kind === 'page' ? e.page.slug : ''}`)))
    if (present) continue
    const pageIndex = candidatePageIndex(site, kind)
    if (pageIndex >= 0) {
      if (site.pages[pageIndex].showInHeader === false) continue
      gaps.push({ kind, target: { type: 'page', pageIndex } })
      count++
      continue
    }
    if (multiPage || links >= NAV_LINK_MAX) continue
    if (!site.sections.some((s) => s.type === GAP_SECTION[kind] && !s.hidden)) continue
    gaps.push({ kind, target: { type: 'link' } })
    count++
    links++
  }
  return gaps
}

/** Contact-only view of `findMenuGaps`. */
export function findContactMenuGap(site: WebsiteSchema): { kind: 'page'; pageIndex: number } | { kind: 'link' } | null {
  const gap = findMenuGaps(site, ['contact'])[0]
  if (!gap) return null
  return gap.target.type === 'page' ? { kind: 'page', pageIndex: gap.target.pageIndex } : { kind: 'link' }
}

/** Closes the gaps found by `findMenuGaps`; returns the same site when there are none. */
export function addMissingToMenu(site: WebsiteSchema, lang: 'tr' | 'en' = 'tr', kinds: MenuGapKind[] = DEFAULT_MENU_KINDS): WebsiteSchema {
  const gaps = findMenuGaps(site, kinds)
  if (gaps.length === 0) return site
  const pageIndexes = new Set(gaps.flatMap((g) => (g.target.type === 'page' ? [g.target.pageIndex] : [])))
  const added = gaps
    .filter((g) => g.target.type === 'link')
    .map((g) => ({ label: GAP_LABELS[g.kind][lang], href: `#${GAP_SECTION[g.kind]}` }))
  return {
    ...site,
    pages: site.pages.map((p, i) => (pageIndexes.has(i) ? { ...p, showInHeader: true } : p)),
    navigation: added.length > 0 ? { ...site.navigation, links: [...site.navigation.links, ...added] } : site.navigation,
  }
}

export function addContactToMenu(site: WebsiteSchema, lang: 'tr' | 'en' = 'tr'): WebsiteSchema {
  return addMissingToMenu(site, lang, ['contact'])
}

/** Labels of the entries `addMissingToMenu` would add, for the editor suggestion. */
export function menuGapLabels(site: WebsiteSchema, lang: 'tr' | 'en'): string[] {
  return findMenuGaps(site).map((g) => GAP_LABELS[g.kind][lang])
}

/** How many entries the header would show; the editor uses it to disable the switch at the cap. */
export function countHeaderEntries(entries: MenuEntry[]): number {
  return entries.length
}
