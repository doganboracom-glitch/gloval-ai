import { isStorefront, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { LIST_LIMITS } from '@/lib/list-limits'
import { canonicalKindOfPage, LEGACY_ALIASES } from '@/lib/canonical-pages'
import { anchorSectionType } from '@/lib/live-page-links'

type ServicesSection = Extract<Section, { type: 'services' }>
type FeaturesSection = Extract<Section, { type: 'features' }>

function hrefsOf(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) hrefsOf(item, out)
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'href' && typeof value === 'string') out.push(value)
      else hrefsOf(value, out)
    }
  }
  return out
}

function pointsAtServices(href: string): boolean {
  const trimmed = href.trim()
  if (trimmed.startsWith('#')) return anchorSectionType(trimmed.slice(1)) === 'services'
  const match = /^\/([^/?#]+)\/?(?:[?#].*)?$/.exec(trimmed)
  return match ? LEGACY_ALIASES[match[1].toLowerCase()] === 'services' : false
}

/** True when the generated site plans a Services page or links to Services anywhere. */
function referencesServices(site: WebsiteSchema): boolean {
  const planned = (site.pages ?? []).some((page) => page.kind !== 'detail' && canonicalKindOfPage(page) === 'services')
  if (planned) return true
  return hrefsOf([site.navigation, site.sections, (site.pages ?? []).map((p) => (p as { sections?: unknown }).sections)]).some(
    pointsAtServices,
  )
}

function insertBeforeContact(sections: Section[], section: Section): Section[] {
  const anchor = sections.findIndex((s) => s.type === 'contact' || s.type === 'footer')
  const next = [...sections]
  next.splice(anchor === -1 ? next.length : anchor, 0, section)
  return next
}

function toServices(features: FeaturesSection): ServicesSection | null {
  if (features.items.length < LIST_LIMITS.services.min) return null
  const { type: _type, items, ...rest } = features
  return {
    ...rest,
    type: 'services',
    items: items.slice(0, LIST_LIMITS.services.max).map((item) => ({
      title: item.title,
      description: item.description,
      ...(item.icon ? { icon: item.icon } : {}),
    })),
  }
}

/**
 * Deterministic post-generation guard for NEWLY generated sites only. A site that
 * plans a Services page or links to Services must carry a `services` section on
 * its home page, because the plan's page limit can drop the page and every link
 * to it then needs an `#services` target.
 *
 * The list is never invented: it comes from what generation already produced, in
 * this order: a hidden home section is shown again; a Services page's own section
 * is moved to the home page; otherwise the generated `features` list becomes the
 * services list in place. With no list at all nothing is added (links to a missing
 * target are hidden at publish by `withLivePageLinks`). Storefronts are skipped.
 */
export function ensureServicesSection<T extends WebsiteSchema>(site: T): T {
  if (isStorefront(site)) return site

  const existing = site.sections.find((s): s is ServicesSection => s.type === 'services')
  if (existing) {
    if (!existing.hidden) return site
    const { hidden: _hidden, ...visible } = existing
    return { ...site, sections: site.sections.map((s) => (s === existing ? (visible as ServicesSection) : s)) }
  }

  if (!referencesServices(site)) return site

  for (const page of site.pages ?? []) {
    const own = (page as { sections?: Section[] }).sections?.find(
      (s): s is ServicesSection => s.type === 'services' && !s.hidden,
    )
    if (own) return { ...site, sections: insertBeforeContact(site.sections, own) }
  }

  const features = site.sections.find((s): s is FeaturesSection => s.type === 'features' && !s.hidden)
  const converted = features ? toServices(features) : null
  if (!features || !converted) return site
  return { ...site, sections: site.sections.map((s) => (s === features ? converted : s)) }
}
