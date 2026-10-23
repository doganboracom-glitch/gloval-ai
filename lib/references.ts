import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { uniquePageSlug } from '@/lib/page-slugs'

/**
 * References (client / partner logos)
 * -----------------------------------
 * A `references` section may own one system page (`/referanslar`, `detailOf: 'references'`).
 * Entries are written by the site owner only: the AI never invents clients, so a new section starts
 * empty and stays invisible on the public site until at least one real reference exists.
 * Only `pageEnabled === true` creates the page, so sites saved before this feature keep their pages.
 * Pure and shared by the renderer, editor, sitemap and public routes.
 */

type Lang = 'tr' | 'en'
type ReferencesSection = Extract<Section, { type: 'references' }>
export type ReferenceItem = ReferencesSection['items'][number]

export const REFERENCE_TITLE_MAX = 80
export const REFERENCE_NAME_MAX = 80
export const REFERENCE_LINK_LABEL_MAX = 40
export const REFERENCE_SUBTITLE_MAX = 200
/** Logos visible at once in the home carousel (desktop). Tablet shows 3, mobile 2. With this many or fewer it stays still. */
export const REFERENCES_CAROUSEL_VISIBLE = 4
/** Milliseconds between one-logo steps. */
export const REFERENCES_CAROUSEL_INTERVAL_MS = 4000
export const REFERENCES_HOME_PREVIEW = 20
/** The references page shows this many logos first; the rest sit behind a "show more" button. */
export const REFERENCES_PAGE_INITIAL = 10
/** Logo uploads: PNG / JPG / WebP, at most 2 MB each. */
export const REFERENCE_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const REFERENCE_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

const SLUGS: Record<Lang, string> = { tr: 'referanslar', en: 'references' }
const TITLES: Record<Lang, string> = { tr: 'Referanslar', en: 'References' }
const LINK_LABELS: Record<Lang, string> = { tr: 'Tüm referansları gör', en: 'See all references' }

const siteLang = (site: Pick<WebsiteSchema, 'meta'>): Lang => (site.meta.language === 'en' ? 'en' : 'tr')

export function referencesPageTitle(lang: Lang): string {
  return TITLES[lang]
}
export function referencesExampleTagLabel(lang: Lang): string {
  return lang === 'en' ? 'Example content' : 'Örnek içerik'
}
export function referencesLinkDefaultLabel(lang: Lang): string {
  return LINK_LABELS[lang]
}

/** A reference that may appear publicly: it needs a name or a logo. */
export function isRealReference(item: ReferenceItem): boolean {
  return item.name.trim().length > 0 || (item.logo?.src?.trim().length ?? 0) > 0
}

export function realReferences(section: Pick<ReferencesSection, 'items'>): ReferenceItem[] {
  return section.items.filter(isRealReference)
}

export type ReferenceLogoType = (typeof REFERENCE_LOGO_TYPES)[number]

/** Detects PNG / JPEG / WebP from the first bytes, whatever the file name or declared MIME says. SVG and anything else is `null`. */
export function sniffLogoType(bytes: ArrayLike<number>): ReferenceLogoType | null {
  const b = (i: number) => bytes[i] ?? -1
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png'
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return 'image/webp'
  }
  return null
}

/** True for a base64 data URI whose bytes really are PNG / JPEG / WebP. Used server-side by the edit operation. */
export function isAllowedLogoDataUri(src: string): boolean {
  const match = /^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/]{24})/i.exec(src.trim())
  if (!match) return false
  try {
    const raw = atob(match[1])
    const bytes = Array.from(raw, (ch) => ch.charCodeAt(0))
    return sniffLogoType(bytes) !== null
  } catch {
    return false
  }
}

export const REFERENCE_URL_MAX = 200

export type ReferenceUrlError = 'invalid' | 'scheme' | 'credentials' | 'local' | 'private' | 'too_long'
export type ReferenceUrlResult = { ok: true; url: string } | { ok: false; error: ReferenceUrlError }

const LOCAL_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.lan', '.home.arpa']
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

function isPrivateIpv4(host: string): boolean {
  const [a, b] = host.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

/**
 * Strict check for a reference's optional website address, shared by the editor (live warning), the edit
 * operation and the server-side page sync. Only http/https; a missing scheme becomes `https://`; credentials,
 * local names and private IPs are refused. An empty input is valid and means "no link" (`url: ''`).
 */
export function validateReferenceUrl(input: string): ReferenceUrlResult {
  const raw = input.trim()
  if (raw === '') return { ok: true, url: '' }
  const fail = (error: ReferenceUrlError): ReferenceUrlResult => ({ ok: false, error })
  if (raw.length > REFERENCE_URL_MAX) return fail('too_long')
  if (/[\s\u0000-\u001f\u007f\\]/.test(raw)) return fail('invalid')

  // `host:8080` is a port, not a scheme, so a scheme is only a word followed by a colon and a non-digit.
  const scheme = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(raw)?.[1]?.toLowerCase()
  let withScheme: string
  if (scheme) {
    if (scheme !== 'http' && scheme !== 'https') return fail('scheme')
    if (!/^https?:\/\//i.test(raw)) return fail('invalid')
    withScheme = raw
  } else {
    withScheme = raw.startsWith('//') ? `https:${raw}` : `https://${raw}`
  }
  if (/^https?:\/\/[^/?#]*@/i.test(withScheme)) return fail('credentials')

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return fail('invalid')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fail('scheme')
  if (parsed.username || parsed.password) return fail('credentials')

  const host = parsed.hostname.replace(/\.$/, '').toLowerCase()
  if (host.startsWith('[')) return fail('private')
  if (host === 'localhost' || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return fail('local')
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIpv4(host)) return fail('private')
  } else {
    const labels = host.split('.')
    if (host.length > 253 || labels.length < 2) return fail('invalid')
    if (!labels.every((label) => DOMAIN_LABEL.test(label)) || !TLD.test(labels[labels.length - 1])) return fail('invalid')
  }

  const bare = parsed.pathname === '/' && !parsed.search && !parsed.hash
  const url = bare ? parsed.href.replace(/\/$/, '') : parsed.href
  return url.length > REFERENCE_URL_MAX ? fail('too_long') : { ok: true, url }
}

/** The normalized link target for a stored value, or `null` when it is empty or not allowed (never a link). */
export function safeReferenceUrl(value: string | undefined): string | null {
  if (!value) return null
  const checked = validateReferenceUrl(value)
  return checked.ok && checked.url ? checked.url : null
}

function sanitizeSectionList(sections: Section[]): Section[] {
  let changed = false
  const out = sections.map((section): Section => {
    if (section.type !== 'references') return section
    let touched = false
    const items = section.items.map((item) => {
      if (item.url === undefined) return item
      const next = safeReferenceUrl(item.url)
      if (next === item.url) return item
      touched = true
      const { url: _dropped, ...rest } = item
      return next ? { ...rest, url: next } : rest
    })
    if (!touched) return section
    changed = true
    return { ...section, items }
  })
  return changed ? out : sections
}

/** Server-side guard: drops or normalizes any reference address that fails `validateReferenceUrl`. Same object when nothing changes. */
export function sanitizeReferenceUrls<T extends WebsiteSchema>(site: T): T {
  const sections = sanitizeSectionList(site.sections)
  let pagesChanged = false
  const pages = site.pages?.map((page) => {
    if (!page.sections) return page
    const next = sanitizeSectionList(page.sections)
    if (next === page.sections) return page
    pagesChanged = true
    return { ...page, sections: next }
  })
  if (sections === site.sections && !pagesChanged) return site
  return { ...site, sections, ...(pagesChanged ? { pages } : {}) }
}

function referenceSections(site: Pick<WebsiteSchema, 'sections' | 'pages'>): ReferencesSection[] {
  const all = [...site.sections, ...(site.pages ?? []).flatMap((p) => p.sections ?? [])]
  return all.filter((s): s is ReferencesSection => s.type === 'references' && !s.hidden)
}

export function findReferencesPage(site: Pick<WebsiteSchema, 'pages'>) {
  return (site.pages ?? []).find((p) => p.kind === 'detail' && p.detailOf === 'references') ?? null
}

export type ResolvedReferences = {
  lang: Lang
  slug: string
  title: string
  section: ReferencesSection | null
  items: ReferenceItem[]
  /** The system page exists, its switch is on and at least one real reference backs it. */
  active: boolean
}

/** `demo`: reserved for symmetry with reviews; demo logos are real entries flagged `sample`. */
export type ReferencesResolveOptions = { demo?: boolean }

export function resolveReferences(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
  _options: ReferencesResolveOptions = {},
): ResolvedReferences {
  const lang = siteLang(site)
  const page = findReferencesPage(site)
  let section: ReferencesSection | null = null
  let items: ReferenceItem[] = []
  for (const candidate of referenceSections(site)) {
    const real = realReferences(candidate)
    if (real.length > 0) {
      section = candidate
      items = real
      break
    }
  }
  return {
    lang,
    slug: page?.slug || SLUGS[lang],
    title: page?.title || TITLES[lang],
    section,
    items,
    active: !!page && !!section && section.pageEnabled === true && items.length > 0,
  }
}

/** Where the home section's "all references" link points, or null when it must not be shown. */
export function referencesLink(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
  section: Pick<ReferencesSection, 'linkEnabled' | 'linkLabel'>,
): { href: string; label: string } | null {
  if (section.linkEnabled === false) return null
  const resolved = resolveReferences(site)
  if (!resolved.active) return null
  return {
    href: `/${resolved.slug}`,
    label: section.linkLabel?.trim() || LINK_LABELS[resolved.lang],
  }
}

export function referencesDescription(site: Pick<WebsiteSchema, 'meta'>, name: string, count: number): string {
  return siteLang(site) === 'en' ? `${count} references of ${name}.` : `${name} referansları (${count}).`
}

/**
 * Keeps the system page in step with the section: created while a section with `pageEnabled` has a real
 * reference, dropped again when not. New pages count toward the plan page limit. Idempotent; returns the
 * same object when nothing changes. A page the owner already runs on the same address is left alone.
 */
export function syncReferencesPage<T extends WebsiteSchema>(input: T, pageLimit: number = SITE_PAGE_HARD_CAP): T {
  const site = sanitizeReferenceUrls(input)
  const pages = site.pages ?? []
  const existing = findReferencesPage(site)
  const wanted = referenceSections(site).some((s) => s.pageEnabled === true && realReferences(s).length > 0)
  if (!wanted) {
    if (!existing) return site
    return { ...site, pages: pages.filter((p) => p !== existing) }
  }
  if (existing) return site

  const lang = siteLang(site)
  const own = new Set([SLUGS.tr, SLUGS.en])
  if (pages.some((p) => !p.isHome && own.has((p.slug || '').toLowerCase()))) return site
  if (pages.length >= Math.min(pageLimit, SITE_PAGE_HARD_CAP)) return site

  const taken = new Set(pages.map((p) => (p.slug || '').toLowerCase()))
  const slug = taken.has(SLUGS[lang]) ? uniquePageSlug(SLUGS[lang], taken) : SLUGS[lang]
  const created = { slug, title: TITLES[lang], kind: 'detail' as const, detailOf: 'references' as const }
  const base = pages.length === 0 ? [{ slug: 'home', title: site.meta.name, isHome: true }] : pages
  return { ...site, pages: [...base, created] }
}

/**
 * AI guard. The model must never author clients: whatever it returns for a `references` section is
 * replaced by the owner's existing entries (matched by position in the previous site) or emptied.
 */
export function stripAiReferences<T extends { sections: Section[] }>(next: T, previous?: { sections: Section[] } | null): T {
  const prior = previous?.sections.filter((s): s is ReferencesSection => s.type === 'references') ?? []
  let seen = 0
  let changed = false
  const sections = next.sections.map((section): Section => {
    if (section.type !== 'references') return section
    const before = prior[seen++]
    const items = before?.items ?? []
    if (section.items === items) return section
    changed = true
    return { ...section, items }
  })
  return changed ? { ...next, sections } : next
}

/** Generation never produces references: drop any the model emitted. */
export function dropAiReferences<T extends { sections: Section[] }>(site: T): T {
  if (!site.sections.some((s) => s.type === 'references')) return site
  return { ...site, sections: site.sections.filter((s) => s.type !== 'references') }
}
