import { isLegalDocHidden, resolveLegalDoc } from '@/lib/site-legal-docs'
import {
  cleanName,
  isValidEmail,
  normalizeIyzicoPhone,
  MAX_NAME_LENGTH,
} from '@/lib/iyzico-onboarding-shared'
import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'

/**
 * iyzico merchant-application assistant (pure rules, no I/O).
 *
 * Nothing here talks to iyzico: the owner applies on iyzico's own site. This
 * module only decides (a) whether the published store looks ready for iyzico's
 * review and (b) whether a "please contact me" request is well-formed.
 */

export const APPLICATION_CONSENT_VERSION = 'application-request-v1'

export const APPLICATION_LIMITS = {
  /** Requests per user inside the window. */
  perUser: 3,
  windowMs: 24 * 60 * 60 * 1000,
  /** A reservation without a final status younger than this still counts. */
  inFlightMs: 2 * 60 * 1000,
} as const

export const IYZICO_APPLY_URL = 'https://www.iyzico.com'

/** Public documents iyzico asks for; informational only, nothing is uploaded here. */
export const APPLICATION_DOCUMENTS = [
  { key: 'identity', tr: 'Kimlik belgesi (yetkili kişi)', en: 'ID document (authorised person)' },
  { key: 'iban', tr: 'İşletme IBAN bilgisi', en: 'Business IBAN details' },
  { key: 'tax', tr: 'Vergi levhası', en: 'Tax certificate' },
  { key: 'signature', tr: 'İmza sirküleri veya imza beyanı (şirketler için)', en: 'Signature circular (companies)' },
  { key: 'site', tr: 'Yayında, erişilebilir bir web sitesi', en: 'A live, reachable website' },
] as const

export type ReadinessItemId =
  | 'published'
  | 'reachable'
  | 'https'
  | 'privacy'
  | 'about'
  | 'contact'
  | 'delivery'
  | 'distance'
  | 'footer'

export type ReadinessProblem =
  | 'not_published'
  | 'unreachable'
  | 'not_https'
  | 'missing'
  | 'hidden'
  | 'empty'
  | 'placeholder'
  | 'footer_hidden'
  | 'unchecked'

/** Where in the editor the owner can fix an item. */
export type ReadinessFix = 'publish' | 'legal' | 'sections' | 'footer'

export type ReadinessItem = {
  id: ReadinessItemId
  ok: boolean
  problem?: ReadinessProblem
  fix: ReadinessFix
}

export type SiteProbe = { status: number; finalUrl: string } | { status: null; finalUrl: null }

/** Bracketed template leftovers such as `[Adres]` or `[Vergi No]`. */
const PLACEHOLDER_RE = /\[[^\]\n]{2,60}\]/

export function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text) || /lorem ipsum/i.test(text)
}

type LegalCheckId = 'privacy' | 'delivery' | 'distance'

const LEGAL_CHECKS: ReadonlyArray<{ id: LegalCheckId; slug: string }> = [
  { id: 'privacy', slug: 'gizlilik-politikasi' },
  { id: 'delivery', slug: 'teslimat-ve-iade' },
  { id: 'distance', slug: 'mesafeli-satis-sozlesmesi' },
]

function legalItem(id: LegalCheckId, slug: string, site: WebsiteSchema, siteName: string): ReadinessItem {
  if (isLegalDocHidden(site, slug)) return { id, ok: false, problem: 'hidden', fix: 'legal' }
  const doc = resolveLegalDoc(slug, site, siteName)
  if (!doc) return { id, ok: false, problem: 'missing', fix: 'legal' }
  const text = doc.blocks
    .flatMap((block) =>
      block.type === 'list'
        ? block.items.flatMap((item) => item.map((run) => run.text))
        : block.inline.map((run) => run.text),
    )
    .join(' ')
    .trim()
  if (text.length < 40) return { id, ok: false, problem: 'empty', fix: 'legal' }
  if (hasPlaceholder(text)) return { id, ok: false, problem: 'placeholder', fix: 'legal' }
  return { id, ok: true, fix: 'legal' }
}

function sectionItem(
  id: 'about' | 'contact',
  site: WebsiteSchema,
): ReadinessItem {
  const section = site.sections.find((s) => s.type === id)
  if (!section) return { id, ok: false, problem: 'missing', fix: 'sections' }
  if (section.hidden) return { id, ok: false, problem: 'hidden', fix: 'sections' }

  let text = ''
  if (section.type === 'about') text = [section.title, section.body].join(' ')
  if (section.type === 'contact') {
    const flagged = new Set(section.sampleFields ?? [])
    text = (['email', 'phone', 'address'] as const)
      .filter((key) => !flagged.has(key))
      .map((key) => section[key])
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
  }
  if (text.trim().length < (id === 'about' ? 20 : 5)) return { id, ok: false, problem: 'empty', fix: 'sections' }
  if (hasPlaceholder(text)) return { id, ok: false, problem: 'placeholder', fix: 'sections' }
  return { id, ok: true, fix: 'sections' }
}

export type ReadinessInput = {
  published: boolean
  slug: string | null
  /** Result of requesting the live site; null when it was not requested. */
  probe: SiteProbe | null
  schema: WebsiteSchema
  siteName: string
}

export function evaluateSiteReadiness(input: ReadinessInput): ReadinessItem[] {
  const { published, slug, probe, schema, siteName } = input
  const live = published && Boolean(slug)
  const items: ReadinessItem[] = []

  items.push(live ? { id: 'published', ok: true, fix: 'publish' } : { id: 'published', ok: false, problem: 'not_published', fix: 'publish' })

  if (!live) {
    items.push({ id: 'reachable', ok: false, problem: 'unchecked', fix: 'publish' })
    items.push({ id: 'https', ok: false, problem: 'unchecked', fix: 'publish' })
  } else {
    const reachable = probe !== null && probe.status !== null && probe.status >= 200 && probe.status < 400
    items.push(
      reachable
        ? { id: 'reachable', ok: true, fix: 'publish' }
        : { id: 'reachable', ok: false, problem: 'unreachable', fix: 'publish' },
    )
    items.push(
      reachable && probe?.finalUrl?.startsWith('https://')
        ? { id: 'https', ok: true, fix: 'publish' }
        : { id: 'https', ok: false, problem: reachable ? 'not_https' : 'unchecked', fix: 'publish' },
    )
  }

  items.push(legalItem('privacy', LEGAL_CHECKS[0].slug, schema, siteName))
  items.push(sectionItem('about', schema))
  items.push(sectionItem('contact', schema))
  items.push(legalItem('delivery', LEGAL_CHECKS[1].slug, schema, siteName))
  items.push(legalItem('distance', LEGAL_CHECKS[2].slug, schema, siteName))

  // A store footer always carries the iyzico / Mastercard / Visa logos
  // (STORE_BASE_PAYMENT_BADGES), so the footer section being on is what counts.
  const footer = schema.sections.find((s) => s.type === 'footer')
  if (!isStorefront(schema) || !footer) items.push({ id: 'footer', ok: false, problem: 'missing', fix: 'footer' })
  else if (footer.hidden) items.push({ id: 'footer', ok: false, problem: 'footer_hidden', fix: 'footer' })
  else items.push({ id: 'footer', ok: true, fix: 'footer' })

  return items
}

export type ApplicationInput = { name: unknown; email: unknown; phone: unknown }

export type ApplicationError =
  | 'invalid_name'
  | 'invalid_email'
  | 'invalid_phone'
  | 'consent_required'
  | 'site_not_published'
  | 'rate_limited'
  | 'unavailable'

export type ApplicationValidation =
  | { ok: true; value: { name: string; email: string; phone: string } }
  | { ok: false; error: 'invalid_name' | 'invalid_email' | 'invalid_phone' }

export function validateApplicationInput(input: ApplicationInput): ApplicationValidation {
  const name = cleanName(input.name)
  if (name.length < 2 || name.length > MAX_NAME_LENGTH * 2 || !name.includes(' ')) {
    return { ok: false, error: 'invalid_name' }
  }
  const email = typeof input.email === 'string' ? input.email.trim() : ''
  if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' }
  const phone = normalizeIyzicoPhone(input.phone)
  if (!phone) return { ok: false, error: 'invalid_phone' }
  return { ok: true, value: { name, email, phone } }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildApplicationEmail(input: {
  name: string
  email: string
  phone: string
  siteName: string
  siteUrl: string
  projectId: string
}): { subject: string; html: string; text: string } {
  const rows: Array<[string, string]> = [
    ['Ad soyad', input.name],
    ['E-posta', input.email],
    ['Telefon', input.phone],
    ['Site adı', input.siteName],
    ['Site adresi', input.siteUrl],
    ['Proje', input.projectId],
  ]
  const subject = `iyzico başvuru talebi: ${input.siteName}`.replace(/[\r\n]+/g, ' ').slice(0, 150)
  const html = `<p>Bir mağaza sahibi iyzico başvurusu için iletişim talep etti.</p><table cellpadding="6">${rows
    .map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`)
    .join('')}</table>`
  const text = ['Bir mağaza sahibi iyzico başvurusu için iletişim talep etti.', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n')
  return { subject, html, text }
}

export type ApplicationMarker = 'applied' | 'account_opened'

export type ApplicationState = { appliedAt: string | null; accountOpenedAt: string | null }
