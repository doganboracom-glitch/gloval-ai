import type { Section, WebsiteSchema } from '@/lib/website-schema'

const fabricatedPatterns = [
  /\b(?:%|yüzde|percent)\b/i,
  /\b(?:müşteri|clients?|customers?|başarı|success|memnuniyet|satisfaction|ödül|award|sertifika|certificate|basın|press)\b/i,
  /\b(?:son\s+\d+|only\s+\d+|limited|kaçırma|hemen al)\b/i,
  /\b(?:\d+)\s*(?:yıl|years?|ay|months?)\b/i,
]

function looksUnverified(value: unknown): boolean {
  return typeof value === 'string' && fabricatedPatterns.some((pattern) => pattern.test(value))
}

function markSample<T extends { sample?: boolean }>(item: T): T {
  return { ...item, sample: true }
}

/**
 * Applies a conservative trust boundary to fresh AI output only. Existing
 * persisted websites are never passed here, so publishing an old site does
 * not rewrite its content.
 */
export function sanitizeGeneratedProofContent(site: WebsiteSchema): WebsiteSchema {
  return {
    ...site,
    sections: site.sections
      .map((section) => sanitizeSection(section))
      .filter((section) => section.type !== 'testimonials' || section.items.length > 0),
  }
}

function sanitizeSection(section: Section): Section {
  switch (section.type) {
    case 'testimonials': {
      const items = section.items
        .filter((item) => item.quote.trim() && item.author.trim())
        .map((item) => (looksUnverified(item.quote) || looksUnverified(item.author) ? markSample(item) : item))
      return { ...section, items, sample: section.sample || items.some((item) => item.sample) }
    }
    case 'stats': {
      const items = section.items.map((item) => (looksUnverified(item.value) || looksUnverified(item.label) ? markSample(item) : item))
      return { ...section, items, sample: section.sample || items.some((item) => item.sample) }
    }
    case 'pricing': {
      const plans = section.plans.map((plan) => {
        const suspicious = looksUnverified(plan.price) || plan.features.some(looksUnverified)
        return suspicious ? markSample(plan) : plan
      })
      return { ...section, plans, sample: section.sample || plans.some((plan) => plan.sample) }
    }
    case 'hero':
      return looksUnverified(section.trustText) ? { ...section, trustText: undefined, sample: true } : section
    case 'products': {
      const items = section.items.map((item) => {
        const suspicious = Boolean(item.oldPrice || item.badge) || looksUnverified(item.price)
        return suspicious ? markSample(item) : item
      })
      return { ...section, items, sample: section.sample || items.some((item) => item.sample) }
    }
    default:
      return section
  }
}

export function isSampleProduct(item: { sample?: boolean; oldPrice?: string; badge?: string }): boolean {
  return Boolean(item.sample || item.oldPrice || item.badge)
}
