import type { Section, WebsiteSchema } from '@/lib/website-schema'

/**
 * Sample (illustrative) content handling. `lib/proof-content.ts` flags generated
 * testimonials, stats, discounts, badges, plans and the hero trust line with
 * `sample: true`. This module is the single place that reads that flag:
 *
 *  - the publish gate (`collectSampleFindings` / `unresolvedSampleFindings`),
 *  - the owner approval flow (`approveSampleFindings`, `hideSampleSections`),
 *  - the editor (`clearEditedSampleFlags`: editing an item makes it the owner's),
 *  - the public renderer (`stripSampleContent`, a last line of defence).
 *
 * Pure and isomorphic on purpose: the client and the server must compute the
 * exact same finding ids from the same schema.
 */

/** Version of the approval statement the owner agrees to; stored with each attestation. */
export const SAMPLE_ATTESTATION_VERSION = 'sample-content-v1'

/** `publishProject` refusal reason while unapproved sample content remains. */
export const SAMPLE_CONTENT_ERROR = 'SAMPLE_CONTENT' as const

export type SampleKind = 'testimonials' | 'stats' | 'pricing' | 'discount' | 'badge' | 'trust' | 'product'

export type SampleItemFinding = {
  /** Content digest. Changes whenever the item's claim text changes. */
  id: string
  /** Position inside the section's item list; null for the hero trust line. */
  itemIndex: number | null
  kind: SampleKind
  /** Short human label for the approval modal (never persisted). */
  label: string
}

export type SampleSectionFinding = {
  /** Index in `site.sections` (NOT the per-page visible index). */
  sectionIndex: number
  sectionType: Section['type']
  items: SampleItemFinding[]
}

type AnyItem = { sample?: boolean } & Record<string, unknown>

type ItemSpec = {
  key: 'items' | 'plans'
  kind: (item: AnyItem) => SampleKind
  fields: (item: AnyItem) => unknown[]
  label: (item: AnyItem) => string
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

function truncate(text: string, max = 70): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

const ITEM_SPECS: Partial<Record<Section['type'], ItemSpec>> = {
  testimonials: {
    key: 'items',
    kind: () => 'testimonials',
    fields: (i) => [i.quote, i.author, i.role],
    label: (i) => truncate(`${str(i.author)}: “${str(i.quote)}”`),
  },
  stats: {
    key: 'items',
    kind: () => 'stats',
    fields: (i) => [i.value, i.label],
    label: (i) => truncate(`${str(i.value)} ${str(i.label)}`),
  },
  pricing: {
    key: 'plans',
    kind: () => 'pricing',
    fields: (i) => [i.name, i.price, i.period, i.description, i.features, i.buttonText],
    label: (i) => truncate(`${str(i.name)} ${str(i.price)}${str(i.period)}`),
  },
  products: {
    key: 'items',
    kind: (i) => (str(i.oldPrice).trim() ? 'discount' : str(i.badge).trim() ? 'badge' : 'product'),
    fields: (i) => [i.name, i.price, i.oldPrice, i.badge, i.category, i.description],
    label: (i) => {
      const extra = [str(i.oldPrice).trim() && `~${str(i.oldPrice)}~`, str(i.badge).trim()].filter(Boolean).join(' ')
      return truncate(`${str(i.name)} ${str(i.price)}${extra ? ` (${extra})` : ''}`)
    },
  },
}

/** Deterministic, key-order independent serialisation used for digests. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** cyrb53: small, sync, non-cryptographic hash. Enough for change detection. */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Digest of an item's claim text, prefixed with its section type. Holds no readable content. */
export function sampleDigest(sectionType: string, fields: unknown[]): string {
  const text = `${sectionType}\u0001${stableStringify(fields.map((f) => (typeof f === 'string' ? f.trim() : f)))}`
  return `sc1-${cyrb53(text, 0).toString(16).padStart(14, '0')}${cyrb53(text, 7).toString(16).padStart(14, '0')}`
}

function itemsOf(section: Section, spec: ItemSpec): AnyItem[] {
  const list = (section as unknown as Record<string, unknown>)[spec.key]
  return Array.isArray(list) ? (list as AnyItem[]) : []
}

function withItems(section: Section, spec: ItemSpec, items: AnyItem[]): Section {
  const sample = items.some((item) => item.sample) || undefined
  return { ...section, [spec.key]: items, sample } as Section
}

function heroTrustDigest(trustText: string | undefined): string {
  return sampleDigest('hero', [trustText ?? ''])
}

/** Every visible sample section/item of the site, in document order. */
export function collectSampleFindings(site: WebsiteSchema): SampleSectionFinding[] {
  const findings: SampleSectionFinding[] = []
  site.sections.forEach((section, sectionIndex) => {
    if (section.hidden) return
    if (section.type === 'hero') {
      if (section.sample && section.trustText?.trim()) {
        findings.push({
          sectionIndex,
          sectionType: 'hero',
          items: [
            { id: heroTrustDigest(section.trustText), itemIndex: null, kind: 'trust', label: truncate(section.trustText) },
          ],
        })
      }
      return
    }
    const spec = ITEM_SPECS[section.type]
    if (!spec) return
    const items: SampleItemFinding[] = []
    itemsOf(section, spec).forEach((item, itemIndex) => {
      if (!item.sample) return
      items.push({
        id: sampleDigest(section.type, spec.fields(item)),
        itemIndex,
        kind: spec.kind(item),
        label: spec.label(item),
      })
    })
    if (items.length) findings.push({ sectionIndex, sectionType: section.type, items })
  })
  return findings
}

/** Findings the owner has neither hidden, edited nor attested (by digest). */
export function unresolvedSampleFindings(site: WebsiteSchema, attested: ReadonlySet<string>): SampleSectionFinding[] {
  return collectSampleFindings(site)
    .map((section) => ({ ...section, items: section.items.filter((item) => !attested.has(item.id)) }))
    .filter((section) => section.items.length > 0)
}

/** Clears the sample flag of every item whose digest the owner approved. */
export function approveSampleFindings(site: WebsiteSchema, approvedIds: ReadonlySet<string>): WebsiteSchema {
  if (approvedIds.size === 0) return site
  const sections = site.sections.map((section): Section => {
    if (section.hidden) return section
    if (section.type === 'hero') {
      return section.sample && approvedIds.has(heroTrustDigest(section.trustText))
        ? { ...section, sample: undefined }
        : section
    }
    const spec = ITEM_SPECS[section.type]
    if (!spec) return section
    const items = itemsOf(section, spec)
    if (!items.some((item) => item.sample)) return section
    const next = items.map((item) =>
      item.sample && approvedIds.has(sampleDigest(section.type, spec.fields(item))) ? { ...item, sample: undefined } : item,
    )
    return withItems(section, spec, next)
  })
  return { ...site, sections }
}

/** Hides (never deletes) the given sections, by their index in `site.sections`. */
export function hideSampleSections(site: WebsiteSchema, sectionIndexes: readonly number[]): WebsiteSchema {
  if (sectionIndexes.length === 0) return site
  const targets = new Set(sectionIndexes)
  return { ...site, sections: site.sections.map((s, i) => (targets.has(i) ? { ...s, hidden: true } : s)) }
}

/**
 * Manual-edit hook: an item the owner changed is theirs now, so its sample flag
 * goes away and publish never asks about it. An item whose digest still exists
 * among the previous flagged items is untouched (reordering/deleting siblings
 * must not clear it).
 */
export function clearEditedSampleFlags(prev: WebsiteSchema, next: WebsiteSchema): WebsiteSchema {
  const before = new Set<string>()
  for (const finding of collectSampleFindings({ ...prev, sections: prev.sections.map((s) => ({ ...s, hidden: false })) })) {
    for (const item of finding.items) before.add(item.id)
  }
  if (before.size === 0) return next

  let changed = false
  const sections = next.sections.map((section): Section => {
    if (section.type === 'hero') {
      if (section.sample && !before.has(heroTrustDigest(section.trustText))) {
        changed = true
        return { ...section, sample: undefined }
      }
      return section
    }
    const spec = ITEM_SPECS[section.type]
    if (!spec) return section
    const items = itemsOf(section, spec)
    let touched = false
    const cleared = items.map((item) => {
      if (item.sample && !before.has(sampleDigest(section.type, spec.fields(item)))) {
        touched = true
        return { ...item, sample: undefined }
      }
      return item
    })
    if (!touched) return section
    changed = true
    return withItems(section, spec, cleared)
  })
  return changed ? { ...next, sections } : next
}

/**
 * Public-render safety net: removes any item still flagged `sample`. Approved
 * items lose their flag at publish time, so whatever is still flagged was never
 * confirmed. Sections left empty are dropped; a flagged hero loses its trust line.
 */
export function stripSampleContent(site: WebsiteSchema): WebsiteSchema {
  let changed = false
  const sections = site.sections.flatMap((section): Section[] => {
    if (section.hidden) return [section]
    if (section.type === 'hero') {
      if (!section.sample) return [section]
      changed = true
      return [{ ...section, trustText: undefined, sample: undefined }]
    }
    const spec = ITEM_SPECS[section.type]
    if (!spec) return [section]
    const items = itemsOf(section, spec)
    const kept = items.filter((item) => !item.sample)
    if (kept.length === items.length) return [section]
    changed = true
    return kept.length === 0 ? [] : [withItems(section, spec, kept)]
  })
  return changed ? { ...site, sections } : site
}

/** Removes the flagged items of one section (used by the product "delete" action). */
export function removeSampleItem(site: WebsiteSchema, sectionIndex: number, itemIndex: number): WebsiteSchema {
  const section = site.sections[sectionIndex]
  const spec = section && ITEM_SPECS[section.type]
  if (!section || !spec) return site
  const items = itemsOf(section, spec)
  if (items.length <= 1 || !items[itemIndex]) return site
  const next = withItems(
    section,
    spec,
    items.filter((_, i) => i !== itemIndex),
  )
  return { ...site, sections: site.sections.map((s, i) => (i === sectionIndex ? next : s)) }
}

/**
 * Deletes one flagged item. When it is the section's only item the section is
 * hidden instead, so a store never ends up with an empty product grid and
 * nothing the owner may still want is destroyed.
 */
export function removeOrHideSampleItem(site: WebsiteSchema, sectionIndex: number, itemIndex: number): WebsiteSchema {
  const section = site.sections[sectionIndex]
  const spec = section && ITEM_SPECS[section.type]
  if (!section || !spec) return site
  const items = itemsOf(section, spec)
  if (!items[itemIndex]) return site
  if (items.length <= 1) return hideSampleSections(site, [sectionIndex])
  return removeSampleItem(site, sectionIndex, itemIndex)
}

/** True when the section still holds at least one flagged item (drives editor badges). */
export function sectionHasSample(section: Section): boolean {
  if (section.type === 'hero') return Boolean(section.sample && section.trustText?.trim())
  const spec = ITEM_SPECS[section.type]
  return spec ? itemsOf(section, spec).some((item) => item.sample) : false
}
