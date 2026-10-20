import { stripAnnouncementHint } from '@/lib/announcement'
import { DEMO_PHONE } from '@/lib/contact-links'
import {
  isPlaceholderAddress,
  isPlaceholderEmail,
  isPlaceholderHref,
  isPlaceholderPhone,
  isPlaceholderText,
  type PlaceholderContext,
} from '@/lib/placeholder-contact'
import { isStorefront, type Section, type WebsiteSchema } from '@/lib/website-schema'

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

/**
 * Statement version of "this detected contact value is real". Kept apart from
 * `SAMPLE_ATTESTATION_VERSION` so the two statements never vouch for each other.
 */
export const CONTACT_ATTESTATION_VERSION = 'contact-real-v1'

/** Extra facts the server knows and the pure schema does not. */
export type DetectionContext = {
  /** Hosts connected to the site; e-mail on these is the owner's own, never a placeholder. */
  ownDomains?: readonly string[]
}

/** `publishProject` refusal reason while unapproved sample content remains. */
export const SAMPLE_CONTENT_ERROR = 'SAMPLE_CONTENT' as const

export type SampleKind =
  | 'testimonials'
  | 'stats'
  | 'pricing'
  | 'discount'
  | 'badge'
  | 'trust'
  | 'product'
  | 'contact'
  | 'info'

/**
 * Contact-section fields that can hold an unconfirmed placeholder. They are
 * tracked per field (`contact.sampleFields`) so confirming or editing one never
 * vouches for the others. Placeholders are stripped from every public render
 * and never block publishing: the gate only lists them and sends the owner to
 * the contact section.
 */
export const CONTACT_SAMPLE_FIELDS = ['email', 'phone', 'address', 'mapEmbed'] as const
export type ContactSampleField = (typeof CONTACT_SAMPLE_FIELDS)[number]

type ContactSectionLike = Extract<Section, { type: 'contact' }>

function contactFieldValue(section: ContactSectionLike, field: ContactSampleField): string {
  return str(section[field]).trim()
}

function contactDigest(field: ContactSampleField, value: string): string {
  return sampleDigest('contact', [field, value])
}

/** Flagged contact fields that still hold a value. */
export function sampleContactFields(section: Section): ContactSampleField[] {
  if (section.type !== 'contact') return []
  const flagged = new Set(section.sampleFields ?? [])
  return CONTACT_SAMPLE_FIELDS.filter((field) => flagged.has(field) && contactFieldValue(section, field) !== '')
}

export type SampleItemFinding = {
  /** Content digest. Changes whenever the item's claim text changes. */
  id: string
  /** Position inside the section's item list; null for the hero trust line. */
  itemIndex: number | null
  kind: SampleKind
  /** Short human label for the approval modal (never persisted). */
  label: string
  /**
   * Found by its content (a known fake pattern), not by a `sample` flag. For these
   * the owner picks: hide the value (`approvals`), confirm it is real
   * (`confirmedReal`, stored as an attestation) or edit it.
   */
  detected?: boolean
  /** Field the value lives in, e.g. `phone`, `footer.tagline`, `contactActions.whatsapp` (never the value). */
  source?: string
  /** False for values that can never be real (the shared demo line); the owner can only hide or edit. */
  confirmable?: boolean
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
  /** Smallest item count the website schema accepts for this section. */
  minItems: number
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
    minItems: 1,
    kind: () => 'testimonials',
    fields: (i) => [i.quote, i.author, i.role],
    label: (i) => truncate(`${str(i.author)}: “${str(i.quote)}”`),
  },
  stats: {
    key: 'items',
    minItems: 2,
    kind: () => 'stats',
    fields: (i) => [i.value, i.label],
    label: (i) => truncate(`${str(i.value)} ${str(i.label)}`),
  },
  pricing: {
    key: 'plans',
    minItems: 1,
    kind: () => 'pricing',
    fields: (i) => [i.name, i.price, i.period, i.description, i.features, i.buttonText],
    label: (i) => truncate(`${str(i.name)} ${str(i.price)}${str(i.period)}`),
  },
  faq: {
    key: 'items',
    minItems: 2,
    kind: () => 'info',
    fields: (i) => [i.question, i.answer],
    label: (i) => truncate(str(i.question)),
  },
  announcement: {
    key: 'items',
    minItems: 1,
    kind: () => 'info',
    fields: (i) => [i.text, i.link],
    label: (i) => truncate(str(i.text)),
  },
  products: {
    key: 'items',
    minItems: 2,
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

function placeholderContext(site: WebsiteSchema, context?: DetectionContext): PlaceholderContext {
  return { siteName: site.meta?.name, ownDomains: context?.ownDomains }
}

/** Digest of a detected contact value; identical to `contactDigest` for the four contact fields. */
function detectedDigest(source: string, value: string): string {
  return sampleDigest('contact', [source, value])
}

function detectedItem(source: string, value: string, confirmable = true): SampleItemFinding {
  return {
    id: detectedDigest(source, value),
    itemIndex: null,
    kind: 'contact',
    label: `${source}: ${truncate(value)}`,
    source,
    detected: true,
    confirmable,
  }
}

function contactFieldLooksFake(field: ContactSampleField, value: string, pc: PlaceholderContext): boolean {
  if (field === 'phone') return isPlaceholderPhone(value)
  if (field === 'email') return isPlaceholderEmail(value, pc)
  if (field === 'address') return isPlaceholderAddress(value)
  return false
}

/** Contact-section findings: flagged fields plus fields whose value matches a known fake pattern. */
function contactFindingItems(section: ContactSectionLike, pc: PlaceholderContext): SampleItemFinding[] {
  const flagged = new Set(section.sampleFields ?? [])
  const items: SampleItemFinding[] = []
  for (const field of CONTACT_SAMPLE_FIELDS) {
    const value = contactFieldValue(section, field)
    if (value === '') continue
    const fake = contactFieldLooksFake(field, value, pc)
    if (fake) items.push(detectedItem(field, value))
    else if (flagged.has(field)) {
      items.push({ id: contactDigest(field, value), itemIndex: null, kind: 'contact', label: `${field}: ${truncate(value)}`, source: field })
    }
  }
  const recipient = str(section.recipientEmail).trim()
  if (recipient && isPlaceholderEmail(recipient, pc)) items.push(detectedItem('recipientEmail', recipient))
  const description = str(section.description).trim()
  if (description && isPlaceholderText(description, pc)) items.push(detectedItem('contact.description', description))
  return items
}

function footerLinkValue(link: { label: string; href: string }): string {
  return `${link.label} ${link.href}`
}

function footerLinkLooksFake(link: { label: string; href: string }, pc: PlaceholderContext): boolean {
  return isPlaceholderHref(link.href, pc) || isPlaceholderText(link.label, pc)
}

function footerFindingItems(section: Extract<Section, { type: 'footer' }>, pc: PlaceholderContext): SampleItemFinding[] {
  const items: SampleItemFinding[] = []
  const tagline = str(section.tagline).trim()
  if (tagline && isPlaceholderText(tagline, pc)) items.push(detectedItem('footer.tagline', tagline))
  const copyright = str(section.copyright).trim()
  if (copyright && isPlaceholderText(copyright, pc)) items.push(detectedItem('footer.copyright', copyright))
  for (const column of section.columns ?? []) {
    for (const link of column.links) {
      if (footerLinkLooksFake(link, pc)) items.push(detectedItem('footer.link', footerLinkValue(link)))
    }
  }
  return items
}

function ownDialablePhone(site: WebsiteSchema): boolean {
  const dialable = (value: string | undefined) => (value ?? '').replace(/\D/g, '').length >= 7
  return site.sections.some((section) => {
    if (section.type === 'contact') return !sampleContactFields(section).includes('phone') && dialable(section.phone)
    if (section.type === 'footer') {
      return (section.columns ?? []).some((column) =>
        column.links.some((link) => (link.href.startsWith('tel:') ? dialable(link.href) : /^[\d\s+()-]+$/.test(link.label) && dialable(link.label))),
      )
    }
    return false
  })
}

/** Floating-button numbers, including the shared demo line that legacy stores still fall back to. */
function contactActionItems(site: WebsiteSchema): SampleItemFinding[] {
  const items: SampleItemFinding[] = []
  const actions = site.contactActions
  if (actions) {
    if (actions.enabled === false) return items
    const phone = str(actions.phone).trim()
    if (phone && isPlaceholderPhone(phone)) items.push(detectedItem('contactActions.phone', phone))
    const whatsapp = str(actions.whatsapp).trim()
    if (whatsapp && isPlaceholderPhone(whatsapp)) items.push(detectedItem('contactActions.whatsapp', whatsapp))
    return items
  }
  if (isStorefront(site) && !ownDialablePhone(site)) {
    items.push(detectedItem('contactActions.demoFallback', DEMO_PHONE.display, false))
  }
  return items
}

function contactTargetIndex(site: WebsiteSchema): number {
  const contact = site.sections.findIndex((s) => s.type === 'contact')
  if (contact !== -1) return contact
  const footer = site.sections.findIndex((s) => s.type === 'footer')
  return footer !== -1 ? footer : Math.max(0, site.sections.length - 1)
}

/**
 * Every visible sample section/item of the site, in document order. Flagged
 * items come from `sample` markers; contact-like values (contact section,
 * footer, hero trust line, floating buttons) are also matched by content against
 * the known fake patterns of `lib/placeholder-contact.ts` (`detected: true`).
 */
export function collectSampleFindings(site: WebsiteSchema, context?: DetectionContext): SampleSectionFinding[] {
  const findings: SampleSectionFinding[] = []
  const pc = placeholderContext(site, context)
  site.sections.forEach((section, sectionIndex) => {
    if (section.hidden) return
    if (section.type === 'hero') {
      const trust = section.trustText?.trim()
      if (trust) {
        const fake = isPlaceholderText(trust, pc)
        if (section.sample || fake) {
          const item: SampleItemFinding = {
            id: heroTrustDigest(section.trustText),
            itemIndex: null,
            kind: 'trust',
            label: truncate(trust),
            ...(fake ? { source: 'hero.trustText', detected: true, confirmable: true } : {}),
          }
          findings.push({ sectionIndex, sectionType: 'hero', items: [item] })
        }
      }
      return
    }
    if (section.type === 'contact') {
      const items = contactFindingItems(section, pc)
      if (items.length) findings.push({ sectionIndex, sectionType: 'contact', items })
      return
    }
    if (section.type === 'footer') {
      const items = footerFindingItems(section, pc)
      if (items.length) findings.push({ sectionIndex, sectionType: 'footer', items })
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
  const actionItems = contactActionItems(site)
  if (actionItems.length > 0 && site.sections.length > 0) {
    const sectionIndex = contactTargetIndex(site)
    const existing = findings.find((finding) => finding.sectionIndex === sectionIndex)
    if (existing) existing.items.push(...actionItems)
    else {
      findings.push({ sectionIndex, sectionType: site.sections[sectionIndex].type, items: actionItems })
      findings.sort((a, b) => a.sectionIndex - b.sectionIndex)
    }
  }
  return findings
}

/**
 * Findings that stop a publish until the owner approves, hides or edits them.
 * Contact values and content-detected placeholders are excluded on purpose: they
 * can never be "approved as sample"; they are hidden, confirmed real (detected
 * only) or stripped from the public site instead.
 */
export function collectBlockingSampleFindings(site: WebsiteSchema, context?: DetectionContext): SampleSectionFinding[] {
  return collectSampleFindings(site, context)
    .filter((finding) => finding.sectionType !== 'contact')
    .map((finding) => ({ ...finding, items: finding.items.filter((item) => !item.detected) }))
    .filter((finding) => finding.items.length > 0)
}

/**
 * Applies the owner's choice for content-detected placeholders:
 *  - `hide`: the value is removed from the public site (contact fields are flagged
 *    so the draft keeps them; text and link values are cleared, buttons emptied);
 *  - `real`: the owner confirmed it, so any sample flag on it is dropped.
 * Ids that match nothing are ignored, so a stale client cannot change other content.
 */
export function resolveDetectedPlaceholders(
  site: WebsiteSchema,
  choice: { hide: ReadonlySet<string>; real: ReadonlySet<string> },
  context?: DetectionContext,
): WebsiteSchema {
  if (choice.hide.size === 0 && choice.real.size === 0) return site
  const pc = placeholderContext(site, context)
  const hits = (source: string, value: string, ids: ReadonlySet<string>) => ids.has(detectedDigest(source, value))

  const sections = site.sections.map((section): Section => {
    if (section.type === 'hero') {
      const trust = section.trustText?.trim()
      if (!trust || !isPlaceholderText(trust, pc)) return section
      const id = heroTrustDigest(section.trustText)
      if (choice.real.has(id)) return { ...section, sample: undefined }
      if (choice.hide.has(id)) return { ...section, trustText: undefined, sample: undefined }
      return section
    }
    if (section.type === 'contact') {
      const flagged = new Set<string>(section.sampleFields ?? [])
      let next: ContactSectionLike = section
      for (const field of CONTACT_SAMPLE_FIELDS) {
        const value = contactFieldValue(section, field)
        if (value === '' || !contactFieldLooksFake(field, value, pc)) continue
        if (hits(field, value, choice.real)) flagged.delete(field)
        else if (hits(field, value, choice.hide)) flagged.add(field)
      }
      const nextFlags = CONTACT_SAMPLE_FIELDS.filter((field) => flagged.has(field))
      next = {
        ...next,
        sampleFields: nextFlags.length > 0 ? [...nextFlags] : undefined,
        sample: nextFlags.length > 0 ? true : undefined,
      }
      const recipient = str(section.recipientEmail).trim()
      if (recipient && isPlaceholderEmail(recipient, pc) && hits('recipientEmail', recipient, choice.hide)) {
        next = { ...next, recipientEmail: undefined }
      }
      const description = str(section.description).trim()
      if (description && isPlaceholderText(description, pc) && hits('contact.description', description, choice.hide)) {
        next = { ...next, description: undefined }
      }
      return next
    }
    if (section.type === 'footer') {
      const tagline = str(section.tagline).trim()
      const copyright = str(section.copyright).trim()
      return {
        ...section,
        tagline: tagline && isPlaceholderText(tagline, pc) && hits('footer.tagline', tagline, choice.hide) ? undefined : section.tagline,
        copyright:
          copyright && isPlaceholderText(copyright, pc) && hits('footer.copyright', copyright, choice.hide)
            ? undefined
            : section.copyright,
        columns: section.columns?.map((column) => ({
          ...column,
          links: column.links.filter(
            (link) => !(footerLinkLooksFake(link, pc) && hits('footer.link', footerLinkValue(link), choice.hide)),
          ),
        })),
      }
    }
    return section
  })

  let contactActions = site.contactActions
  if (contactActions) {
    const phone = str(contactActions.phone).trim()
    const whatsapp = str(contactActions.whatsapp).trim()
    contactActions = {
      ...contactActions,
      phone: phone && isPlaceholderPhone(phone) && hits('contactActions.phone', phone, choice.hide) ? '' : contactActions.phone,
      whatsapp:
        whatsapp && isPlaceholderPhone(whatsapp) && hits('contactActions.whatsapp', whatsapp, choice.hide)
          ? ''
          : contactActions.whatsapp,
    }
  } else if (isStorefront(site) && !ownDialablePhone(site) && hits('contactActions.demoFallback', DEMO_PHONE.display, choice.hide)) {
    contactActions = { phone: '', whatsapp: '', placeholderFallback: false }
  }

  return { ...site, sections, contactActions }
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
    const next = items.map((item) => {
      if (!item.sample || !approvedIds.has(sampleDigest(section.type, spec.fields(item)))) return item
      // An approved demo announcement keeps the owner's sentence but never the "add your announcements" hint.
      return section.type === 'announcement'
        ? { ...item, sample: undefined, text: stripAnnouncementHint(str(item.text)) }
        : { ...item, sample: undefined }
    })
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
    if (section.type === 'contact') {
      const flagged = sampleContactFields(section)
      if (flagged.length === 0) return section
      const kept = flagged.filter((field) => before.has(contactDigest(field, contactFieldValue(section, field))))
      if (kept.length === flagged.length) return section
      changed = true
      return { ...section, sampleFields: kept.length ? kept : undefined, sample: kept.length ? true : undefined }
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
  const stripSection = (section: Section): Section[] => {
    if (section.hidden) return [section]
    if (section.type === 'hero') {
      if (!section.sample) return [section]
      changed = true
      return [{ ...section, trustText: undefined, sample: undefined }]
    }
    if (section.type === 'contact') {
      if (!section.sample && !section.sampleFields?.length) return [section]
      changed = true
      return [stripSampleContactFields(section)]
    }
    const spec = ITEM_SPECS[section.type]
    if (!spec) return [section]
    const items = itemsOf(section, spec)
    const kept = items.filter((item) => !item.sample)
    if (kept.length === items.length) return [section]
    changed = true
    return kept.length === 0 ? [] : [withItems(section, spec, kept)]
  }
  const sections = site.sections.flatMap(stripSection)
  // Pages own their sections, so an unapproved sample on a page never reaches the public site either.
  const pages = site.pages?.map((page) =>
    page.sections ? { ...page, sections: page.sections.flatMap(stripSection) } : page,
  )
  return changed ? { ...site, sections, ...(pages ? { pages } : {}) } : site
}

/** Drops every flagged placeholder value from a contact section; the form stays. */
function stripSampleContactFields(section: ContactSectionLike): ContactSectionLike {
  const next: ContactSectionLike = { ...section, sample: undefined, sampleFields: undefined }
  for (const field of section.sampleFields ?? []) next[field] = undefined
  return next
}

/** Removes one item, refusing when that would leave fewer than the schema's minimum. */
export function removeSampleItem(site: WebsiteSchema, sectionIndex: number, itemIndex: number): WebsiteSchema {
  const section = site.sections[sectionIndex]
  const spec = section && ITEM_SPECS[section.type]
  if (!section || !spec) return site
  const items = itemsOf(section, spec)
  if (items.length - 1 < spec.minItems || !items[itemIndex]) return site
  const next = withItems(
    section,
    spec,
    items.filter((_, i) => i !== itemIndex),
  )
  return { ...site, sections: site.sections.map((s, i) => (i === sectionIndex ? next : s)) }
}

/**
 * Deletes one flagged item. When removing it would leave fewer items than the
 * website schema allows (products need at least 2, so a saved site would fail
 * validation), the section is hidden instead: nothing is destroyed, a store
 * never ends up with a broken or empty product grid, and the site stays valid.
 */
export function removeOrHideSampleItem(site: WebsiteSchema, sectionIndex: number, itemIndex: number): WebsiteSchema {
  const section = site.sections[sectionIndex]
  const spec = section && ITEM_SPECS[section.type]
  if (!section || !spec) return site
  const items = itemsOf(section, spec)
  if (!items[itemIndex]) return site
  if (items.length - 1 < spec.minItems) return hideSampleSections(site, [sectionIndex])
  return removeSampleItem(site, sectionIndex, itemIndex)
}

/** True when the section still holds at least one flagged item (drives editor badges). */
export function sectionHasSample(section: Section): boolean {
  if (section.type === 'hero') return Boolean(section.sample && section.trustText?.trim())
  if (section.type === 'contact') return sampleContactFields(section).length > 0
  const spec = ITEM_SPECS[section.type]
  return spec ? itemsOf(section, spec).some((item) => item.sample) : false
}
