import type { Section, WebsiteSchema } from '@/lib/website-schema'

/*
 * Unicode-aware on purpose: `\b` treats Turkish letters (ı, ö, ş, ...) as
 * non-word characters, so "başarı" or "ödül" would never match with it.
 */
const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])'
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])'

const unverifiedClaimPatterns: RegExp[] = [
  /\d\s*%|%\s*\d/u,
  new RegExp(`${NOT_LETTER_BEFORE}(?:yüzde|percent(?:age)?)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(
    `${NOT_LETTER_BEFORE}(?:müşteri|musteri|başarı|basari|memnuniyet|ödül|odul|sertifika|basın|clients?|customers?|success|satisfaction|awards?|certificat\\p{L}*|press)${NOT_LETTER_AFTER}`,
    'iu',
  ),
  new RegExp(`${NOT_LETTER_BEFORE}(?:son\\s+\\d+|only\\s+\\d+|limited|kaçırma|hemen\\s+al)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(`\\d+\\s*(?:yıl|years?|ay|months?)${NOT_LETTER_AFTER}`, 'iu'),
  /\d\s*\+/u,
]

function looksUnverified(value: unknown): boolean {
  return typeof value === 'string' && unverifiedClaimPatterns.some((pattern) => pattern.test(value))
}

function markSample<T extends { sample?: boolean }>(item: T): T {
  return { ...item, sample: true }
}

/** Items the AI left exactly as they were are the owner's content, not new output. */
function carriedOver<T>(item: T, baselineItems: readonly unknown[]): boolean {
  const key = JSON.stringify(item)
  return baselineItems.some((candidate) => JSON.stringify(candidate) === key)
}

function baselineItemsOf(baseline: WebsiteSchema | undefined, type: Section['type']): unknown[] {
  if (!baseline) return []
  return baseline.sections.flatMap((section): unknown[] => {
    if (section.type !== type) return []
    switch (section.type) {
      case 'testimonials':
      case 'stats':
      case 'products':
        return section.items
      case 'pricing':
        return section.plans
      case 'hero':
        return [section.trustText]
      default:
        return []
    }
  })
}

/**
 * Trust boundary for fresh AI output (site generation and AI edits).
 *
 * Every testimonial, statistic and pricing plan the model produced is
 * illustrative until the owner confirms it, so it is flagged `sample: true`;
 * product items are flagged when they carry a discount, a badge or an unverified
 * claim. Pass the stored site as `baseline` for edits: items the model returned
 * unchanged are never touched, so editing a published site cannot silently
 * re-label (or rewrite) content the owner already has.
 *
 * The flag does not hide anything: sample sections stay visible on the site and
 * publishing does not check it. Only the store sync reads it (see store-sync.ts).
 */
export function sanitizeGeneratedProofContent(site: WebsiteSchema, baseline?: WebsiteSchema): WebsiteSchema {
  return {
    ...site,
    sections: site.sections
      .map((section) => sanitizeSection(section, baseline))
      .filter((section) => section.type !== 'testimonials' || section.items.length > 0),
  }
}

function sanitizeSection(section: Section, baseline: WebsiteSchema | undefined): Section {
  const known = baselineItemsOf(baseline, section.type)
  const mark = <T extends { sample?: boolean }>(item: T, flag: boolean): T =>
    flag && !carriedOver(item, known) ? markSample(item) : item

  switch (section.type) {
    case 'testimonials': {
      const items = section.items
        .filter((item) => item.quote.trim() && item.author.trim())
        .map((item) => mark(item, true))
      return { ...section, items, sample: section.sample || items.some((item) => item.sample) || undefined }
    }
    case 'stats': {
      const items = section.items.map((item) => mark(item, true))
      return { ...section, items, sample: section.sample || items.some((item) => item.sample) || undefined }
    }
    case 'pricing': {
      const plans = section.plans.map((plan) => mark(plan, true))
      return { ...section, plans, sample: section.sample || plans.some((plan) => plan.sample) || undefined }
    }
    case 'hero': {
      if (!looksUnverified(section.trustText) || carriedOver(section.trustText, known)) return section
      return { ...section, trustText: undefined, sample: true }
    }
    case 'products': {
      const items = section.items.map((item) =>
        mark(item, Boolean(item.oldPrice || item.badge) || looksUnverified(item.price)),
      )
      return { ...section, items, sample: section.sample || items.some((item) => item.sample) || undefined }
    }
    default:
      return section
  }
}

/** True only for items the generation/edit pass flagged; legacy schemas never carry the flag. */
export function isSampleProduct(item: { sample?: boolean }): boolean {
  return Boolean(item.sample)
}
