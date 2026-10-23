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

export const REFERENCE_NAME_MAX = 80
export const REFERENCE_URL_MAX = 300
export const REFERENCE_LINK_LABEL_MAX = 40
export const REFERENCE_SUBTITLE_MAX = 200
export const REFERENCES_HOME_PREVIEW = 12

const SLUGS: Record<Lang, string> = { tr: 'referanslar', en: 'references' }
const TITLES: Record<Lang, string> = { tr: 'Referanslar', en: 'References' }
const LINK_LABELS: Record<Lang, string> = { tr: 'Tüm referansları gör', en: 'See all references' }

const siteLang = (site: Pick<WebsiteSchema, 'meta'>): Lang => (site.meta.language === 'en' ? 'en' : 'tr')

export function referencesPageTitle(lang: Lang): string {
  return TITLES[lang]
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

/** Only http(s) links are ever rendered as an anchor. */
export function safeReferenceUrl(url: string | undefined): string | null {
  const value = url?.trim()
  if (!value) return null
  return /^https?:\/\//i.test(value) ? value : null
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

export function resolveReferences(site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>): ResolvedReferences {
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
export function syncReferencesPage<T extends WebsiteSchema>(site: T, pageLimit: number = SITE_PAGE_HARD_CAP): T {
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
