/**
 * Maps the existing site-scan ad draft (the one the Google plan wizard uses) onto Meta copy fields.
 * No new generator: it only reshapes the scan result. The output is a suggestion; the user edits it,
 * and nothing is sent to Meta without validation and an explicit approval of the exact plan version.
 */
import { META_PLAN_LIMITS, type MetaCta } from '@/lib/ads/meta-publish-plan'

export type MetaCopyDraftSource = {
  plan: { sector: string }
  ad: { headlines: string[]; descriptions: string[] }
}

export type MetaCopyDraft = {
  primaryText: string
  headline: string
  description: string
  cta: MetaCta
}

const CTA_BY_SECTOR: Record<string, MetaCta> = {
  retail: 'SHOP_NOW',
  education: 'SIGN_UP',
  technology: 'SIGN_UP',
  construction: 'GET_QUOTE',
  automotive: 'GET_QUOTE',
  legal: 'CONTACT_US',
  finance: 'CONTACT_US',
  health: 'CONTACT_US',
  beauty: 'CONTACT_US',
  real_estate: 'CONTACT_US',
  manufacturing: 'GET_QUOTE',
  logistics: 'GET_QUOTE',
  services: 'CONTACT_US',
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:-]+$/, '')
}

/** Joins whole descriptions until the primary text limit is reached. */
function joinWithinLimit(parts: string[], max: number): string {
  let out = ''
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part
    if (next.length > max) break
    out = next
  }
  return out || clip(parts[0] ?? '', max)
}

export function draftMetaCopyFromScan(source: MetaCopyDraftSource): MetaCopyDraft | null {
  const headlines = source.ad.headlines.map(clean).filter(Boolean)
  const descriptions = source.ad.descriptions.map(clean).filter(Boolean)
  if (headlines.length === 0 || descriptions.length === 0) return null
  return {
    primaryText: joinWithinLimit(descriptions, META_PLAN_LIMITS.primaryText),
    headline: clip(headlines[0], META_PLAN_LIMITS.headline),
    description: clip(descriptions[0], META_PLAN_LIMITS.description),
    cta: CTA_BY_SECTOR[source.plan.sector] ?? 'LEARN_MORE',
  }
}
