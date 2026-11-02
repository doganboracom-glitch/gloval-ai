import type { NavLink, Section, SectionType, WebsiteSchema } from '@/lib/website-schema'
import { isStorefront } from '@/lib/website-schema'
import { canonicalSectionAnchor, findPublicPage, homeSlug, pageNavItems, sectionsForPage } from '@/lib/website-pages'
import {
  canonicalKindOfPage,
  canonicalRedirectTarget,
  LEGACY_ALIASES,
  type CanonicalKind,
} from '@/lib/canonical-pages'
import { validateFooterHref } from '@/lib/footer-links'
import { isBlogRoutePath } from '@/lib/blog-site'
import { matchAlbumHref } from '@/lib/gallery-pages'
import { matchServiceHref } from '@/lib/service-pages'

/** DOM ids emitted by section renderers, keyed by their schema section type. */
const RENDERED_SECTION_IDS: Partial<Record<SectionType, string>> = {
  hero: 'hero',
  heroStrip: 'hero-strip',
  slider: 'slider',
  about: 'about',
  services: 'services',
  features: 'features',
  stats: 'stats',
  pricing: 'pricing',
  testimonials: 'testimonials',
  references: 'references',
  gallery: 'gallery',
  portfolio: 'portfolio',
  products: 'products',
  categories: 'categories',
  process: 'process',
  team: 'team',
  faq: 'faq',
  contact: 'contact',
}

const SECTION_TYPE_BY_RENDERED_ID = new Map<string, SectionType>(
  Object.entries(RENDERED_SECTION_IDS).flatMap(([type, id]) => (id ? [[id, type as SectionType]] : [])),
)

const DETAIL_ANCHOR_ID_BY_PAGE: Record<string, string> = {
  about: 'about-detail',
  services: 'services-detail',
  gallery: 'gallery-detail',
  videos: 'videos-detail',
  testimonials: 'testimonials-detail',
  references: 'references-detail',
  team: 'team-detail',
}

const SPECIAL_ANCHOR_TYPE_BY_ID: Record<string, string> = {
  'about-detail': 'detail:about',
  'services-detail': 'detail:services',
  'gallery-detail': 'detail:gallery',
  'videos-detail': 'detail:videos',
  'testimonials-detail': 'detail:testimonials',
  'references-detail': 'detail:references',
  'team-detail': 'detail:team',
  'service-detail': 'detail:service',
  'gallery-album': 'detail:gallery-album',
  'latest-posts-heading': 'latest-posts',
  cart: 'cart',
}

const SPECIAL_ANCHOR_ID_BY_TYPE = Object.fromEntries(
  Object.entries(SPECIAL_ANCHOR_TYPE_BY_ID).map(([id, type]) => [type, id]),
) as Record<string, string>

const ANCHOR_TYPE: Record<CanonicalKind, SectionType> = {
  about: 'about',
  services: 'services',
  faq: 'faq',
  contact: 'contact',
  gallery: 'gallery',
}

type Page = WebsiteSchema['pages'][number]

export type LivePageLinkOptions = {
  hasBlog?: boolean
  hasLatestPosts?: boolean
}

/**
 * Menu, header, footer, hero/CTA buttons and cards must resolve to a public page,
 * a rendered section id, or a route owned by an enabled site feature. Unknown
 * internal paths and anchors are removed; canonical aliases are rewritten to the
 * actual page or DOM id. External links remain unchanged.
 */
export function isEmptyPage(site: WebsiteSchema, page: Page, index: number): boolean {
  const slug = page.slug || `page-${index}`
  if (page.isHome === true || slug.toLowerCase() === homeSlug(site).toLowerCase()) return false
  return !findPublicPage(site, slug)
}

export function emptyPageSlugs(site: WebsiteSchema): string[] {
  return (site.pages ?? []).flatMap((page, i) => (isEmptyPage(site, page, i) ? [page.slug || `page-${i}`] : []))
}

function normalizeAnchorId(id: string): string {
  let normalized = id.trim().replace(/^#/, '')
  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // Keep malformed fragments as-is so they fail the target lookup below.
  }
  return normalized
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function isHomeAnchor(id: string): boolean {
  const normalized = normalizeAnchorId(id)
  return normalized === 'home' || normalized === 'ana-sayfa' || normalized === 'anasayfa'
}

/** The schema section type or special rendered target an actual DOM id resolves to. */
export function anchorSectionType(id: string): string | null {
  const normalized = normalizeAnchorId(id)
  return (
    SECTION_TYPE_BY_RENDERED_ID.get(normalized) ??
    SPECIAL_ANCHOR_TYPE_BY_ID[normalized] ??
    canonicalSectionAnchor(id)
  )
}

function renderedIdForType(type: string): string | null {
  return RENDERED_SECTION_IDS[type as SectionType] ?? SPECIAL_ANCHOR_ID_BY_TYPE[type] ?? null
}

export function liveSectionTypesForPage(
  site: WebsiteSchema,
  slug: string,
  options: LivePageLinkOptions = {},
): Set<string> {
  const live = new Set<string>()
  const page = pageNavItems(site).find((item) => item.slug.toLowerCase() === slug.toLowerCase())
  if (!page || page.unpublished) return live
  if (isStorefront(site)) live.add('cart')

  if (page.detail && page.detailOf) {
    live.add(`detail:${page.detailOf}`)
    return live
  }

  for (const section of sectionsForPage(site, page.slug)) {
    if (RENDERED_SECTION_IDS[section.type]) live.add(section.type)
  }
  if (page.isHome && options.hasLatestPosts) live.add('latest-posts')
  return live
}

/** Targets that are actually rendered on at least one public page of the site. */
export function liveSectionTypes(site: WebsiteSchema, options: LivePageLinkOptions = {}): Set<string> {
  const live = new Set<string>()
  for (const page of pageNavItems(site)) {
    for (const type of liveSectionTypesForPage(site, page.slug, options)) live.add(type)
  }
  if (isStorefront(site)) live.add('cart')
  return live
}

/** Returns the actual DOM href for a live anchor, normalizing aliases such as `#hakkimizda`. */
export function renderedAnchorHref(id: string, live: ReadonlySet<string>): string | null {
  const orphan = orphanStoreAnchor(id)
  if (orphan) {
    const target = ORPHAN_STORE_ANCHORS[orphan]
    const targetId = target ? renderedIdForType(target) : null
    return target && targetId && live.has(target) ? `#${targetId}` : null
  }

  const type = anchorSectionType(id)
  const renderedId = type ? renderedIdForType(type) : null
  return type && renderedId && live.has(type) ? `#${renderedId}` : null
}

/** Finds the page that owns a live section/detail anchor for in-memory preview navigation. */
export function pageForRenderedAnchor(
  site: WebsiteSchema,
  id: string,
  options: LivePageLinkOptions = {},
): string | null {
  const type = anchorSectionType(id)
  if (!type || type === 'cart') return null
  return (
    pageNavItems(site).find((page) => liveSectionTypesForPage(site, page.slug, options).has(type))?.slug ?? null
  )
}

/**
 * Storefront hero/CTA buttons sometimes use ids no renderer element carries.
 * `featured` has an unambiguous product-section target; campaign ids do not.
 */
const ORPHAN_STORE_ANCHORS: Record<string, SectionType | null> = {
  featured: 'products',
  featuredproducts: 'products',
  deals: null,
  campaigns: null,
  sale: null,
  offers: null,
  newarrivals: null,
  bestsellers: null,
  collections: null,
}

function orphanStoreAnchor(id: string): string | undefined {
  let decoded = id.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // Keep malformed fragments as-is so they fail the target lookup below.
  }
  const key = decoded.toLowerCase().replace(/[^a-z0-9]/g, '')
  return Object.hasOwn(ORPHAN_STORE_ANCHORS, key) ? key : undefined
}

/** True when an anchor is absent or its spelling does not match the rendered DOM id. */
export function isDeadAnchor(href: string, live: ReadonlySet<string>): boolean {
  const trimmed = href.trim()
  if (!trimmed.startsWith('#')) return false
  return renderedAnchorHref(trimmed.slice(1), live) !== trimmed
}

type Context = {
  live: Set<string>
  liveByPage: Map<string, Set<string>>
  options: LivePageLinkOptions
}

type Verdict = { keep: true; href?: string } | { keep: false; anchor: string | null }

const KEEP: Verdict = { keep: true }

const SAFE_EXTERNAL_HREF = /^(?:https?:\/\/|mailto:|tel:|sms:|whatsapp:|\/\/)/i
const STOREFRONT_ROUTE = /^\/(?:store(?:\/[a-z0-9-]+)?|urunlerimiz(?:\/[a-z0-9-]+)?|checkout|cart|hesap|orders?|order(?:\/[a-z0-9-]+)?|odeme|siparis(?:\/[a-z0-9-]+)?)(?:\/)?$/i

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  return normalized || '/'
}

function decodePathToken(token: string): string {
  try {
    return decodeURIComponent(token).toLowerCase()
  } catch {
    return token.toLowerCase()
  }
}

function normalizeConfiguredPath(path: string): string {
  return normalizePathname(path.startsWith('/') ? path : `/${path}`)
}

function contextFor(site: WebsiteSchema, options: LivePageLinkOptions): Context {
  const liveByPage = new Map<string, Set<string>>()
  for (const page of pageNavItems(site)) {
    liveByPage.set(page.slug.toLowerCase(), liveSectionTypesForPage(site, page.slug, options))
  }
  return { live: liveSectionTypes(site, options), liveByPage, options }
}

type ParsedHref =
  | { kind: 'external' }
  | { kind: 'internal'; pathname: string; search: string; hash: string; fragmentOnly: boolean }

function parseHref(href: string): ParsedHref | null {
  const trimmed = href.trim()
  if (!trimmed) return null
  if (SAFE_EXTERNAL_HREF.test(trimmed)) return { kind: 'external' }
  if (trimmed.startsWith('#')) {
    let hash = trimmed.slice(1)
    try {
      hash = decodeURIComponent(hash)
    } catch {
      // Leave malformed fragments for the target resolver to reject.
    }
    return { kind: 'internal', pathname: '/', search: '', hash, fragmentOnly: true }
  }
  if (!trimmed.startsWith('/')) return null

  try {
    const url = new URL(trimmed, 'https://internal.gloval.invalid')
    if (url.origin !== 'https://internal.gloval.invalid') return null
    let hash = url.hash.slice(1)
    try {
      hash = decodeURIComponent(hash)
    } catch {
      // Leave malformed fragments for the target resolver to reject.
    }
    return {
      kind: 'internal',
      pathname: normalizePathname(url.pathname),
      search: url.search,
      hash,
      fragmentOnly: false,
    }
  } catch {
    return null
  }
}

type RouteResolution =
  | { valid: true; path: string; pageSlug?: string; anchors?: Set<string> }
  | { valid: false; fallback: string | null }

function dead(site: WebsiteSchema, kind: CanonicalKind | null, ctx: Context): RouteResolution {
  if (!kind) return { valid: false, fallback: null }
  const type = ANCHOR_TYPE[kind]
  const home = ctx.liveByPage.get(homeSlug(site).toLowerCase())
  const anchorId = renderedIdForType(type)
  return {
    valid: false,
    fallback: anchorId && home?.has(type) ? `#${anchorId}` : null,
  }
}

function configuredRedirectTarget(site: WebsiteSchema, pathname: string): string | null {
  const redirect = site.pageRedirects?.find((item) => normalizeConfiguredPath(item.from) === pathname)
  return redirect?.to ?? null
}

function routeFromRedirect(site: WebsiteSchema, href: string, ctx: Context): RouteResolution {
  const target = parseHref(href)
  if (target?.kind !== 'internal') return { valid: false, fallback: null }
  const route = routeForPath(site, target.pathname, target.search, ctx, false)
  if (!route.valid || !target.hash) return route

  const live = target.fragmentOnly
    ? ctx.live
    : route.anchors ?? (route.pageSlug ? ctx.liveByPage.get(route.pageSlug.toLowerCase()) : undefined) ?? new Set()
  const anchor = renderedAnchorHref(target.hash, live)
  if (!anchor) return { valid: false, fallback: null }
  return { valid: false, fallback: target.fragmentOnly ? anchor : `${route.path}${target.search}${anchor}` }
}

function isEnabledStorePath(site: WebsiteSchema, pathname: string): boolean {
  if (!isStorefront(site)) return false
  return STOREFRONT_ROUTE.test(pathname)
}

export function isStoreRouteHref(site: WebsiteSchema, href: string): boolean {
  const target = parseHref(href)
  if (target?.kind !== 'internal' || target.fragmentOnly) return false

  let pathname = normalizePathname(target.pathname)
  if (pathname.startsWith('/site/')) {
    pathname = normalizePathname(pathname.replace(/^\/site\/[^/]+/, '') || '/')
  }

  return isEnabledStorePath(site, pathname)
}

function runtimeRouteForPath(
  site: WebsiteSchema,
  pathname: string,
  search: string,
  ctx: Context,
): RouteResolution | null {
  const internalHref = `${pathname}${search}`
  if (matchServiceHref(site, internalHref)) {
    return { valid: true, path: pathname, anchors: new Set(['detail:service']) }
  }
  if (matchAlbumHref(site, internalHref)) {
    return { valid: true, path: pathname, anchors: new Set(['detail:gallery-album']) }
  }

  const footerTarget = validateFooterHref(internalHref, site)
  if (footerTarget.ok && (footerTarget.kind === 'legal' || footerTarget.kind === 'store')) {
    return { valid: true, path: pathname, anchors: isStorefront(site) ? new Set(['cart']) : undefined }
  }
  if (ctx.options.hasBlog && isBlogRoutePath(pathname)) return { valid: true, path: pathname }
  if (isEnabledStorePath(site, pathname)) return { valid: true, path: pathname, anchors: new Set(['cart']) }
  return null
}

function routeForPath(
  site: WebsiteSchema,
  rawPathname: string,
  search: string,
  ctx: Context,
  allowRedirects = true,
): RouteResolution {
  let pathname = normalizePathname(rawPathname)
  if (pathname.startsWith('/site/')) {
    pathname = normalizePathname(pathname.replace(/^\/site\/[^/]+/, '') || '/')
  }
  if (pathname === '/') {
    return { valid: true, path: '/', pageSlug: homeSlug(site), anchors: ctx.liveByPage.get(homeSlug(site).toLowerCase()) }
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 1) {
    const token = decodePathToken(segments[0])
    const page = pageNavItems(site).find((item) => item.slug.toLowerCase() === token)
    if (page?.isHome || token === homeSlug(site).toLowerCase()) {
      return { valid: true, path: '/', pageSlug: homeSlug(site), anchors: ctx.liveByPage.get(homeSlug(site).toLowerCase()) }
    }
    if (page && findPublicPage(site, page.slug)) {
      return {
        valid: true,
        path: `/${page.slug}`,
        pageSlug: page.slug,
        anchors: ctx.liveByPage.get(page.slug.toLowerCase()),
      }
    }

    if (allowRedirects) {
      const configured = configuredRedirectTarget(site, pathname)
      if (configured) return routeFromRedirect(site, configured, ctx)
    }

    const canonical = canonicalRedirectTarget(site, token)
    if (canonical) return routeFromRedirect(site, canonical, ctx)

    const alias = LEGACY_ALIASES[token]
    if (alias) return dead(site, alias, ctx)
    const runtimeRoute = runtimeRouteForPath(site, pathname, search, ctx)
    if (runtimeRoute) return runtimeRoute
    if (page) return dead(site, canonicalKindOfPage(page), ctx)
    return { valid: false, fallback: null }
  }

  if (allowRedirects) {
    const configured = configuredRedirectTarget(site, pathname)
    if (configured) return routeFromRedirect(site, configured, ctx)
  }

  return runtimeRouteForPath(site, pathname, search, ctx) ?? { valid: false, fallback: null }
}

function verdictFor(site: WebsiteSchema, href: string, ctx: Context): Verdict {
  const parsed = parseHref(href)
  if (!parsed) return { keep: false, anchor: null }
  if (parsed.kind === 'external') return { keep: true }
  if (parsed.fragmentOnly && !parsed.hash) return { keep: false, anchor: null }
  if (parsed.hash && isHomeAnchor(parsed.hash)) return { keep: true, href: '/' }

  const route = routeForPath(site, parsed.pathname, parsed.search, ctx)
  if (!route.valid) {
    return { keep: false, anchor: parsed.hash ? null : route.fallback }
  }

  const anchor = parsed.hash
    ? renderedAnchorHref(
        parsed.hash,
        parsed.fragmentOnly
          ? ctx.live
          : route.anchors ?? (route.pageSlug ? ctx.liveByPage.get(route.pageSlug.toLowerCase()) : undefined) ?? new Set(),
      )
    : null
  if (parsed.hash && !anchor) return { keep: false, anchor: null }

  const nextHref = parsed.fragmentOnly
    ? anchor
    : `${route.path}${parsed.search}${anchor ?? ''}`
  return { keep: true, href: nextHref ?? route.path }
}

function rewriteLinks(site: WebsiteSchema, links: NavLink[], ctx: Context): NavLink[] {
  let changed = false
  const out: NavLink[] = []
  for (const link of links) {
    const verdict = verdictFor(site, link.href, ctx)
    if (verdict.keep) {
      const next = verdict.href && verdict.href !== link.href ? { ...link, href: verdict.href } : link
      if (next !== link) changed = true
      out.push(next)
      continue
    }
    changed = true
    if (verdict.anchor) out.push({ ...link, href: verdict.anchor })
  }
  return changed ? out : links
}

export function withLivePageLinks(site: WebsiteSchema, options: LivePageLinkOptions = {}): WebsiteSchema {
  const normalizedOptions: LivePageLinkOptions = {
    hasBlog: options.hasBlog ?? site.blogSettings?.showInMenu === true,
    hasLatestPosts: options.hasLatestPosts ?? (site.blogSettings?.showInMenu === true && site.blogSettings?.showLatest === true),
  }
  const empty = new Set(emptyPageSlugs(site))
  let next = site

  if (empty.size > 0) {
    next = { ...next, pages: next.pages.filter((p, i) => !empty.has(p.slug || `page-${i}`)) }
  }

  const ctx = contextFor(next, normalizedOptions)
  const links = rewriteLinks(site, site.navigation.links, ctx)
  let cta = site.navigation.cta
  if (cta) {
    const verdict = cta.href ? verdictFor(site, cta.href, ctx) : { keep: false as const, anchor: null }
    if (verdict.keep) {
      if (verdict.href && verdict.href !== cta.href) cta = { ...cta, href: verdict.href }
    } else {
      cta = verdict.anchor ? { ...cta, href: verdict.anchor } : undefined
    }
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
const LINKED_CONTENT_KEYS = [
  'alt',
  'category',
  'content',
  'description',
  'image',
  'imagePrompt',
  'imageUrl',
  'items',
  'name',
  'price',
  'productId',
  'src',
  'title',
]

function isStandaloneLink(record: Record<string, unknown>): boolean {
  return !LINKED_CONTENT_KEYS.some((key) => key in record)
}

function rewriteNode(site: WebsiteSchema, node: unknown, ctx: Context): unknown {
  if (Array.isArray(node)) return rewriteList(site, node, ctx)
  if (!node || typeof node !== 'object') return node

  const record = node as Record<string, unknown>
  let source = record
  let changed = false
  if (typeof record.href === 'string') {
    const verdict = verdictFor(site, record.href, ctx)
    if (!verdict.keep) {
      if (isStandaloneLink(record)) {
        return verdict.anchor ? { ...record, href: verdict.anchor } : REMOVED
      }
      source = { ...record }
      delete source.href
      changed = true
    } else if (verdict.href && verdict.href !== record.href) {
      source = { ...record, href: verdict.href }
      changed = true
    }
  }

  let copy: Record<string, unknown> | null = changed ? { ...source } : null
  for (const [key, value] of Object.entries(source)) {
    if (key === 'href') continue
    const result = rewriteNode(site, value, ctx)
    if (result === value) continue
    copy ??= { ...source }
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
