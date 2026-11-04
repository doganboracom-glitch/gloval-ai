import type { MakerRequestBudgetRange } from './types'

const BUDGET_RANGES = new Set<MakerRequestBudgetRange>([
  '5000-10000',
  '10000-25000',
  '25000-plus',
])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_PATTERN = /^\+?[\d().\-\s]+$/
const MAX_RAW_LINKS = 20
const MAX_LINKS = 5
const MAX_LINK_LENGTH = 300

export type ValidMakerRequestInput = {
  fullName: string
  phone: string
  email: string
  budgetRange: MakerRequestBudgetRange
  referenceLinks: string[]
  lang: 'tr' | 'en'
}

export type MakerRequestValidationResult =
  | { ok: true; data: ValidMakerRequestInput }
  | { ok: false; reason: 'invalid_input' | 'too_many_links' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeReferenceLinks(value: unknown):
  | { ok: true; links: string[] }
  | { ok: false; reason: 'invalid_input' | 'too_many_links' } {
  if (value === undefined) return { ok: true, links: [] }
  if (!Array.isArray(value) || value.length > MAX_RAW_LINKS) {
    return { ok: false, reason: 'invalid_input' }
  }

  const links: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== 'string') return { ok: false, reason: 'invalid_input' }
    const raw = item.trim()
    if (!raw) continue
    if (raw.length > MAX_LINK_LENGTH) return { ok: false, reason: 'invalid_input' }

    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return { ok: false, reason: 'invalid_input' }
    }

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return { ok: false, reason: 'invalid_input' }
    }

    const normalized = url.toString()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    links.push(normalized)
    if (links.length > MAX_LINKS) return { ok: false, reason: 'too_many_links' }
  }

  return { ok: true, links }
}

export function validateMakerRequestInput(value: unknown): MakerRequestValidationResult {
  if (!isRecord(value)) return { ok: false, reason: 'invalid_input' }

  const fullName = typeof value.fullName === 'string'
    ? value.fullName.trim().replace(/\s+/g, ' ')
    : ''
  const phone = typeof value.phone === 'string'
    ? value.phone.trim().replace(/\s+/g, ' ')
    : ''
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const budgetRange = value.budgetRange
  const phoneDigits = phone.replace(/\D/g, '')

  if (
    Array.from(fullName).length < 2 ||
    Array.from(fullName).length > 120 ||
    phone.length < 7 ||
    phone.length > 32 ||
    !PHONE_PATTERN.test(phone) ||
    phoneDigits.length < 7 ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    typeof budgetRange !== 'string' ||
    !BUDGET_RANGES.has(budgetRange as MakerRequestBudgetRange) ||
    value.consent !== true
  ) {
    return { ok: false, reason: 'invalid_input' }
  }

  const references = normalizeReferenceLinks(value.referenceLinks)
  if (!references.ok) return references

  return {
    ok: true,
    data: {
      fullName,
      phone,
      email,
      budgetRange: budgetRange as MakerRequestBudgetRange,
      referenceLinks: references.links,
      lang: value.lang === 'tr' ? 'tr' : 'en',
    },
  }
}
