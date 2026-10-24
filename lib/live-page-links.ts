import type { NavLink, Section, WebsiteSchema } from '@/lib/website-schema'
import { canonicalSectionAnchor, homeSlug, pageHasContent, pageNavItems, sectionsForPage } from '@/lib/website-pages'
import {
  canonicalKindOfPage,
  canonicalRedirectTarget,
  LEGACY_ALIASES,
  type CanonicalKind,
} from '@/lib/canonical-pages'

/**
 * Menu, header, footer, hero/CTA buttons and cards must never point at something
 * the public site cannot show:
 *  - an address the site answers with a 404 (a page with no content of its own,
 *    see `findPublicPage`), or
 *  - a `#anchor` whose section is not rendered on any live page (hidden, deleted
 *    or never generated).
 * On a published render those links are pruned: a dead page link becomes an
 * anchor to the matching home section when the home page has one, otherwise it is
 * hidden; a dead anchor is hidden. A site with nothing dead is returned as the
 * SAME object, untouched.
 */

const ANCHOR_TYPE: Record<CanonicalKind, Section['type']> = {
  about: 'about',
  services: 'services',
  faq: 'faq',
  contact: 'contact',
  gallery: 'gallery',
}

/** Section types the renderer emits as `id="<type>"`. Other `#ids` are never judged. */
const ANCHOR_IDS = new Set<string>([
  'hero',
  'about',
  'services',
  'features',
  'process',
  'gallery',
  'faq',
  'contact',
  'testimonials',
  'team',
  'stats',
  'references',
  'products',
  'pricing',
  'portfolio',
  'categories',
])

type Page = WebsiteSchema['pages'][number]

/** A page the public site cannot show: not home, not a detail page, no section of its own. */
export function isEmptyPage(site: WebsiteSchema, page: Page, index: number): boolean {
  const slug = page.slug || `page-${index}`
  if (slug === homeSlug(site)) return false
  if (page.isHome === true || page.kind === 'detail') return false
  return !pageHasContent(site, slug)
}

export function emptyPageSlugs(site: WebsiteSchema): string[] {
  return (site.pages ?? []).flatMap((page, i) => (isEmptyPage(site, page, i) ? [page.slug || `page-${i}`] : []))
}

/** The section type an `#anchor` id points at, or null when the id is not a section id. */
export function anchorSectionType(id: string): string | null {
  const lowered = id.trim().toLowerCase()
  if (ANCHOR_IDS.has(lowered)) return lowered
  return canonicalSectionAnchor(id)
}

/** Section types that are rendered (visible) on at least one page of the site. */
export function liveSectionTypes(site: WebsiteSchema): Set<string> {
  const live = new Set<string>()
  for (const page of pageNavItems(site)) {
    for (const section of sectionsForPage(site, page.slug)) live.add(section.type)
  }
  if (live.has('slider')) live.add('hero')
  return live
}

/** True when an `#anchor` href points at a section that does not exist on the live site. */
export function isDeadAnchor(href: string, live: ReadonlySet<string>): boolean {
  const trimmed = href.trim()
  if (!trimmed.startsWith('#') || trimmed.length < 2) return false
  const type = anchorSectionType(trimmed.slice(1))
  return type !== null && !live.has(type)
}

type Context = { empty: Set<string>; live: Set<string> }

type Verdict = { keep: true } | { keep: false; anchor: string | null }

const KEEP: Verdict = { keep: true }

function dead(site: WebsiteSchema, kind: CanonicalKind | null): Verdict {
  if (!kind) return { keep: false, anchor: null }
  const type = ANCHOR_TYPE[kind]
  const onHome = site.sections.some((s) => s.type === type && !s.hidden)
  return { keep: false, anchor: onHome ? `#${type}` : null }
}

function verdictFor(site: WebsiteSchema, href: string, ctx: Context): Verdict {
  if (isDeadAnchor(href, ctx.live)) return { keep: false, anchor: null }
  const match = /^\/([^/?#]+)\/?(?:[?#].*)?$/.exec(href.trim())
  if (!match) return KEEP
  let token = match[1].toLowerCase()
  try {
    token = decodeURIComponent(token)
  } catch {
    // keep the raw segment
  }
  const pages = site.pages ?? []
  const index = pages.findIndex((p, i) => (p.slug || `page-${i}`).toLowerCase() === token)
  if (index >= 0) {
    const page = pages[index]
    return ctx.empty.has(page.slug || `page-${index}`) ? dead(site, canonicalKindOfPage(page)) : KEEP
  }
  const alias = LEGACY_ALIASES[token]
  if (!alias || canonicalRedirectTarget(site, token)) return KEEP
  return dead(site, alias)
}

function rewriteLinks(site: WebsiteSchema, links: NavLink[], ctx: Context): NavLink[] {
  let changed = false
  const out: NavLink[] = []
  for (const link of links) {
    const verdict = verdictFor(site, link.href, ctx)
    if (verdict.keep) {
      out.push(link)
      continue
    }
    changed = true
    if (verdict.anchor) out.push({ ...link, href: verdict.anchor })
  }
  return changed ? out : links
}

export function withLivePageLinks(site: WebsiteSchema): WebsiteSchema {
  const emptySlugs = emptyPageSlugs(site)
  const empty = new Set(emptySlugs)
  let next = site

  if (empty.size > 0) {
    next = { ...next, pages: next.pages.filter((p, i) => !empty.has(p.slug || `page-${i}`)) }
  }

  const ctx: Context = { empty, live: liveSectionTypes(next) }

  const links = rewriteLinks(site, site.navigation.links, ctx)
  let cta = site.navigation.cta
  if (cta) {
    const verdict = verdictFor(site, cta.href ?? '', ctx)
    if (!verdict.keep) cta = verdict.anchor ? { ...cta, href: verdict.anchor } : undefined
  }
  if (links !== site.navigation.links || cta !== site.navigation.cta) {
    next = { ...next, navigation: { ...next.navigation, links, cta } }
  }

  const sections = rewriteList(site, site.sections, ctx)
  if (sections !== site.sections) next = { ...next, sections }

  const pageSource = next.pages ?? []
  const pages = pageSource.map((page) => {
    const pageSections = (page as { sections?: Section[] }).sections
    if (!Array.isArray(pageSections)) return page
    const rewritten = rewriteList(site, pageSections, ctx)
    return rewritten === pageSections ? page : { ...page, sections: rewritten }
  })
  if (pages.some((p, i) => p !== pageSource[i])) next = { ...next, pages }

  return next
}

const REMOVED = Symbol('removed')

/**
 * Walks section data and applies the same verdict to every internal link it finds
 * (hero and slide buttons, CTA buttons, cards, footer columns, legal links...). A
 * link object is rewritten to its anchor or removed; a removed button simply
 * disappears from its parent. Untouched data keeps its identity.
 */
function rewriteNode(site: WebsiteSchema, node: unknown, ctx: Context): unknown {
  if (Array.isArray(node)) return rewriteList(site, node, ctx)
  if (!node || typeof node !== 'object') return node
  const record = node as Record<string, unknown>
  if (typeof record.href === 'string') {
    const verdict = verdictFor(site, record.href, ctx)
    if (!verdict.keep) return verdict.anchor ? { ...record, href: verdict.anchor } : REMOVED
    return node
  }
  let copy: Record<string, unknown> | null = null
  for (const [key, value] of Object.entries(record)) {
    const result = rewriteNode(site, value, ctx)
    if (result === value) continue
    copy ??= { ...record }
    if (result === REMOVED) delete copy[key]
    else copy[key] = result
  }
  return copy ?? node
}

function rewriteList<T>(site: WebsiteSchema, list: T[], ctx: Context): T[] {
  let changed = false
  const out: T[] = []
  for (const item of list) {
    const result = rewriteNode(site, item, ctx)
    if (result !== item) changed = true
    if (result !== REMOVED) out.push(result as T)
  }
  return changed ? out : list
}
