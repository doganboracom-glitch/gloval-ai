import type { NavLink, WebsiteSchema } from '@/lib/website-schema'
import { headerPageItems, pageNavItems, type PageItem } from '@/lib/website-pages'
import { NAV_LINK_MAX } from '@/lib/pricing-config'

/** The header holds at most this many entries; the editor blocks switching on more. */
export const MENU_MAX = 7

/** Key of the blog entry in `navigation.menuOrder` and in the resolved list. */
export const BLOG_MENU_KEY = 'blog'

export type MenuEntry =
  | { kind: 'page'; key: string; label: string; page: PageItem }
  | { kind: 'link'; key: string; label: string; link: NavLink }
  | { kind: 'blog'; key: string; label: string }

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
  if (!menuOrder || menuOrder.length === 0) return picked
  const rank = (p: PageItem) => {
    const index = menuOrder.indexOf(pageMenuKey(p))
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }
  return picked.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p)
}

const CONTACT_WORDS = /ileti[sş]im|contact/i

function isContactText(text: string): boolean {
  return CONTACT_WORDS.test(text.toLocaleLowerCase('tr').replace(/ı/g, 'i'))
}

/**
 * Where the header lacks a Contact entry although the site has one to point at:
 * a contact page (`page`, switched on by `showInHeader`) or, on a one-page site,
 * the contact section (`link`, an anchor in `navigation.links`). Null when the
 * header already has it, the owner switched it off on purpose, or there is
 * nothing to point at.
 */
export function findContactMenuGap(site: WebsiteSchema): { kind: 'page'; pageIndex: number } | { kind: 'link' } | null {
  const pages = site.pages ?? []
  const pageIndex = pages.findIndex((p) => !p.isHome && p.kind !== 'detail' && p.kind !== 'legal' && isContactText(`${p.slug} ${p.title}`))
  if (pageIndex >= 0) {
    const page = pages[pageIndex]
    if (page.showInHeader === false) return null
    const entries = resolveHeaderMenu({ pages: pageNavItems(site), links: [], blog: false, blogLabel: '', menuOrder: site.navigation.menuOrder })
    const inMenu = entries.some((e) => e.key === pageMenuKey(page))
    if (inMenu || entries.length >= MENU_MAX) return null
    return { kind: 'page', pageIndex }
  }
  const multiPage = headerPageItems(pageNavItems(site)).length > 1
  if (multiPage || !site.sections.some((s) => s.type === 'contact' && !s.hidden)) return null
  const links = site.navigation.links
  if (links.length >= NAV_LINK_MAX || links.some((l) => isContactText(l.label) || isContactText(l.href))) return null
  return { kind: 'link' }
}

/** Closes the gap found by `findContactMenuGap`; returns the same site when there is none. */
export function addContactToMenu(site: WebsiteSchema, lang: 'tr' | 'en' = 'tr'): WebsiteSchema {
  const gap = findContactMenuGap(site)
  if (!gap) return site
  if (gap.kind === 'page') {
    return { ...site, pages: site.pages.map((p, i) => (i === gap.pageIndex ? { ...p, showInHeader: true } : p)) }
  }
  const label = lang === 'tr' ? 'İletişim' : 'Contact'
  return { ...site, navigation: { ...site.navigation, links: [...site.navigation.links, { label, href: '#contact' }] } }
}

/** How many entries the header would show; the editor uses it to disable the switch at the cap. */
export function countHeaderEntries(entries: MenuEntry[]): number {
  return entries.length
}
