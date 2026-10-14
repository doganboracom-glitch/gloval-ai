import {
  CONTACT_HONEYPOT_FIELD,
  CONTACT_RATE,
  isValidContactEmail,
  validateContactInput,
  type ContactFieldErrors,
  type ContactInput,
} from '@/lib/site-contact-form'
import { hashContactIp, verifyContactToken } from '@/lib/site-contact-guard'

/**
 * The contact-form pipeline with every side effect injected, so the order of
 * checks (spam first, then limits, then store, then notify) is unit-tested
 * without a database or a mail provider.
 */

export type ContactEmailStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export type ContactSite = {
  projectId: string
  ownerId: string
  name: string
  lang: string
  /** The contact section's visible e-mail. */
  contactEmail: string | null
  /** The owner's explicit "form recipient" setting. */
  recipientEmail: string | null
}

export type ContactRow = ContactInput & { projectId: string; ipHash: string }

export type ContactDeps = {
  now: () => number
  secret: () => string | null
  loadSite: (slug: string) => Promise<ContactSite | null>
  ownerEmail: (ownerId: string) => Promise<string | null>
  countRecent: (filter: { projectId?: string; ipHash?: string }, sinceMs: number) => Promise<number>
  insert: (row: ContactRow) => Promise<{ id: string } | null>
  setEmailStatus: (id: string, status: ContactEmailStatus) => Promise<void>
  sendEmail: (input: { to: string; replyTo: string; site: ContactSite; message: ContactInput }) => Promise<boolean>
  rateLimit: (key: string, limit: number, windowMs: number) => { allowed: boolean }
}

/** Why a submission was refused before storing. Safe to show: none of these reveal how spam is detected beyond timing/limits. */
export type ContactBlockReason = 'too_fast' | 'expired' | 'invalid_token' | 'rate_limited' | 'unknown_site'

/** Server-side failure stage. Contains no personal data, so it is safe to log and to return. */
export type ContactServerCode = 'E_NO_SECRET' | 'E_LOAD_SITE' | 'E_RATE_COUNT' | 'E_INSERT'

export type ContactResult =
  | { ok: true }
  | { ok: false; kind: 'validation'; errors: ContactFieldErrors }
  | { ok: false; kind: 'blocked'; reason: ContactBlockReason }
  | { ok: false; kind: 'unavailable'; code: ContactServerCode }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function usable(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? ''
  return trimmed && isValidContactEmail(trimmed) ? trimmed : null
}

/** Explicit form recipient, else the contact section's e-mail, else the account e-mail. */
export function pickContactRecipient(input: {
  recipientEmail: string | null
  contactEmail: string | null
  ownerEmail: string | null
}): string | null {
  return usable(input.recipientEmail) ?? usable(input.contactEmail) ?? usable(input.ownerEmail)
}

export async function submitSiteContact(
  input: { slug: unknown; body: unknown; ip: string },
  deps: ContactDeps,
): Promise<ContactResult> {
  const secret = deps.secret()
  if (!secret) return { ok: false, kind: 'unavailable', code: 'E_NO_SECRET' }

  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  const body = (input.body && typeof input.body === 'object' ? input.body : {}) as Record<string, unknown>
  if (!slug || slug.length > 63) return { ok: false, kind: 'blocked', reason: 'unknown_site' }

  // A filled decoy means a bot. Answer with success so it learns nothing; store nothing.
  const decoy = body[CONTACT_HONEYPOT_FIELD]
  if (typeof decoy === 'string' && decoy.trim() !== '') return { ok: true }

  const now = deps.now()
  const tokenCheck = verifyContactToken(secret, slug, body.token, now)
  if (tokenCheck === 'too_fast') return { ok: false, kind: 'blocked', reason: 'too_fast' }
  if (tokenCheck === 'expired') return { ok: false, kind: 'blocked', reason: 'expired' }
  if (tokenCheck !== 'ok') return { ok: false, kind: 'blocked', reason: 'invalid_token' }

  const parsed = validateContactInput(body)
  if (!parsed.ok) return { ok: false, kind: 'validation', errors: parsed.errors }

  const ipHash = hashContactIp(secret, input.ip)
  if (!deps.rateLimit(`site-contact:min:${ipHash}`, CONTACT_RATE.perMinute, MINUTE).allowed) {
    return { ok: false, kind: 'blocked', reason: 'rate_limited' }
  }
  if (!deps.rateLimit(`site-contact:hour:${ipHash}`, CONTACT_RATE.perHour, HOUR).allowed) {
    return { ok: false, kind: 'blocked', reason: 'rate_limited' }
  }

  let site: ContactSite | null
  try {
    site = await deps.loadSite(slug)
  } catch {
    return { ok: false, kind: 'unavailable', code: 'E_LOAD_SITE' }
  }
  if (!site) return { ok: false, kind: 'blocked', reason: 'unknown_site' }

  // Database counts back up the per-instance limiter across serverless instances.
  let fromIp: number
  let forSite: number
  try {
    ;[fromIp, forSite] = await Promise.all([
      deps.countRecent({ ipHash }, now - HOUR),
      deps.countRecent({ projectId: site.projectId }, now - DAY),
    ])
  } catch {
    return { ok: false, kind: 'unavailable', code: 'E_RATE_COUNT' }
  }
  if (fromIp >= CONTACT_RATE.perHour || forSite >= CONTACT_RATE.siteDaily) {
    return { ok: false, kind: 'blocked', reason: 'rate_limited' }
  }

  let saved: { id: string } | null
  try {
    saved = await deps.insert({ ...parsed.value, projectId: site.projectId, ipHash })
  } catch {
    saved = null
  }
  if (!saved) return { ok: false, kind: 'unavailable', code: 'E_INSERT' }

  // From here on the message is safe in the database; notification trouble never loses it.
  let status: ContactEmailStatus = 'failed'
  try {
    const recipient = pickContactRecipient({
      recipientEmail: site.recipientEmail,
      contactEmail: site.contactEmail,
      ownerEmail: usable(site.recipientEmail) || usable(site.contactEmail) ? null : await deps.ownerEmail(site.ownerId),
    })
    if (!recipient) status = 'skipped'
    else {
      const sent = await deps.sendEmail({ to: recipient, replyTo: parsed.value.email, site, message: parsed.value })
      status = sent ? 'sent' : 'failed'
    }
  } catch {
    status = 'failed'
  }
  try {
    await deps.setEmailStatus(saved.id, status)
  } catch {
    // The status is bookkeeping; the visitor's message is already stored.
  }
  return { ok: true }
}
