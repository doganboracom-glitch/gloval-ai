import type { NavLink, Section, WebsiteSchema } from '@/lib/website-schema'
import { homeSlug, pageHasContent } from '@/lib/website-pages'
import {
  canonicalKindOfPage,
  canonicalRedirectTarget,
  LEGACY_ALIASES,
  type CanonicalKind,
} from '@/lib/canonical-pages'

/**
 * Menu, header and footer must never point at an address the public site answers
 * with a 404 (a page with no content of its own, see `findPublicPage`). On a
 * published render those pages and their links are pruned: a link becomes an
 * anchor to the matching home section when the home page has one, otherwise it is
 * hidden. A site with no dead page is returned as the SAME object, untouched.
 */

const ANCHOR_TYPE: Record<CanonicalKind, Section['type']> = {
  about: 'about',
  services: 'services',
  faq: 'faq',
  contact: 'contact',
  gallery: 'gallery',
}

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

type Verdict = { keep: true } | { keep: false; anchor: string | null }

const KEEP: Verdict = { keep: true }

function dead(site: WebsiteSchema, kind: CanonicalKind | null): Verdict {
  if (!kind) return { keep: false, anchor: null }
  const type = ANCHOR_TYPE[kind]
  const onHome = site.sections.some((s) => s.type === type && !s.hidden)
  return { keep: false, anchor: onHome ? `#${type}` : null }
}

function verdictFor(site: WebsiteSchema, href: string, empty: Set<string>): Verdict {
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
    return empty.has(page.slug || `page-${index}`) ? dead(site, canonicalKindOfPage(page)) : KEEP
  }
  const alias = LEGACY_ALIASES[token]
  if (!alias || canonicalRedirectTarget(site, token)) return KEEP
  return dead(site, alias)
}

function rewriteLinks(site: WebsiteSchema, links: NavLink[], empty: Set<string>): NavLink[] {
  let changed = false
  const out: NavLink[] = []
  for (const link of links) {
    const verdict = verdictFor(site, link.href, empty)
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

  const links = rewriteLinks(site, site.navigation.links, empty)
  let cta = site.navigation.cta
  if (cta) {
    const verdict = verdictFor(site, cta.href ?? '', empty)
    if (!verdict.keep) cta = verdict.anchor ? { ...cta, href: verdict.anchor } : undefined
  }
  if (links !== site.navigation.links || cta !== site.navigation.cta) {
    next = { ...next, navigation: { ...next.navigation, links, cta } }
  }

  let sectionsChanged = false
  const sections = site.sections.map((section) => {
    if (section.type !== 'footer') return section
    const columns = section.columns?.map((column) => {
      const columnLinks = rewriteLinks(site, column.links, empty)
      return columnLinks === column.links ? column : { ...column, links: columnLinks }
    })
    const columnsChanged = columns?.some((c, i) => c !== section.columns?.[i]) ?? false
    const legalLinks = section.legal?.links ? rewriteLinks(site, section.legal.links, empty) : undefined
    const legalChanged = legalLinks !== undefined && legalLinks !== section.legal?.links
    if (!columnsChanged && !legalChanged) return section
    sectionsChanged = true
    return {
      ...section,
      ...(columnsChanged ? { columns } : {}),
      ...(legalChanged ? { legal: { ...section.legal, links: legalLinks } } : {}),
    }
  })
  if (sectionsChanged) next = { ...next, sections }

  return next
}
