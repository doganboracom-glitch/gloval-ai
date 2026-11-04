import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  createReferralCookieToken,
  createReferralSignupIntent,
  hashReferralClickSubject,
  hashReferralSignupNonce,
  isReferralRuntimeReady,
  normalizeReferralCode,
  verifyReferralCookieToken,
  verifyReferralSignupIntent,
  type ReferralCookieClaims,
} from '@/lib/referrals/core'

const CLICK_RATE_LIMIT = 30
const CLICK_RATE_WINDOW_MS = 60_000
const SIGNUP_INTENT_LIMIT = 5
const SIGNUP_INTENT_WINDOW_MS = 10 * 60_000
const EMAIL_SIGNUP_MAX_AGE_MS = 15 * 60_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ReferralPartner = {
  id: string
  user_id: string | null
  referral_code: string
}

export type ReferralCaptureResult = {
  handled: boolean
  cookieToken: string | null
}

function isMissingReferralTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === '42P01' || code === 'PGRST205') return true
  return typeof message === 'string' && /relation .*referral_(?:attributions|partners).* does not exist/iu.test(message)
}

async function getActivePartnerByCode(code: string): Promise<ReferralPartner | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('referral_partners')
      .select('id,user_id,referral_code')
      .eq('referral_code', code)
      .eq('status', 'active')
      .maybeSingle()
    if (error || !data) return null
    const partner = data as ReferralPartner
    return partner.user_id ? partner : null
  } catch {
    return null
  }
}

export async function captureReferralClick(input: {
  code: string | null
  existingCookie: string | null
  ipAddress: string | null
  now?: number
}): Promise<ReferralCaptureResult> {
  if (!isReferralRuntimeReady()) return { handled: false, cookieToken: null }
  const code = normalizeReferralCode(input.code)
  if (!code) return { handled: true, cookieToken: null }

  const now = input.now ?? Date.now()
  const subjectHash = await hashReferralClickSubject(input.ipAddress, now)
  if (subjectHash) {
    const limit = checkRateLimit(`referral:click:${subjectHash}`, CLICK_RATE_LIMIT, CLICK_RATE_WINDOW_MS)
    if (!limit.allowed) return { handled: true, cookieToken: null }
  }

  const partner = await getActivePartnerByCode(code)
  if (!partner) return { handled: true, cookieToken: null }

  const existing = await verifyReferralCookieToken(input.existingCookie, now)
  const cookieToken = existing
    ? null
    : await createReferralCookieToken({
        partnerId: partner.id,
        referralCode: partner.referral_code,
        capturedAt: now,
      })

  if (subjectHash) {
    try {
      await createAdminClient().rpc('record_referral_click', {
        p_partner_id: partner.id,
        p_subject_hash: subjectHash,
      })
    } catch {
      // Click counting is best effort; a database outage must not block a visitor.
    }
  }

  return { handled: true, cookieToken }
}

export async function createSignupIntentForReferral(input: {
  source: 'email' | 'oauth'
  referralCookie: string | null
  ipAddress: string | null
}): Promise<string | null> {
  if (!isReferralRuntimeReady()) return null
  const referral = await verifyReferralCookieToken(input.referralCookie)
  if (!referral) return null

  const ipHash = await hashReferralClickSubject(input.ipAddress)
  if (ipHash) {
    const limit = checkRateLimit(`referral:signup-intent:${ipHash}`, SIGNUP_INTENT_LIMIT, SIGNUP_INTENT_WINDOW_MS)
    if (!limit.allowed) return null
  }

  try {
    const intent = await createReferralSignupIntent(input.source)
    if (!intent) return null

    const admin = createAdminClient()
    const now = new Date().toISOString()
    await admin.from('referral_signup_intents').delete().lt('expires_at', now)

    const { error } = await admin.from('referral_signup_intents').insert({
      intent_hash: intent.intentHash,
      source: input.source,
      expires_at: new Date(intent.expiresAt).toISOString(),
    })
    return error ? null : intent.token
  } catch {
    return null
  }
}

async function insertAttribution(input: {
  userId: string
  cookieClaims: ReferralCookieClaims
  source: 'email' | 'oauth'
}): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data: partner, error: partnerError } = await admin
      .from('referral_partners')
      .select('id,user_id,referral_code')
      .eq('id', input.cookieClaims.partnerId)
      .eq('status', 'active')
      .maybeSingle()
    if (
      partnerError ||
      !partner ||
      !partner.user_id ||
      partner.user_id === input.userId ||
      partner.referral_code !== input.cookieClaims.referralCode
    ) {
      return false
    }

    const { error } = await admin.from('referral_attributions').insert({
      referred_user_id: input.userId,
      partner_id: partner.id,
      code_snapshot: input.cookieClaims.referralCode,
      source: input.source,
      captured_at: new Date(input.cookieClaims.capturedAt).toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

async function consumeSignupIntentAndAssign(input: {
  userId: string
  userCreatedAt: string | null | undefined
  intentToken: string | null
  referralCookie: string | null
  source: 'email' | 'oauth'
  now?: number
}): Promise<boolean> {
  if (!isReferralRuntimeReady() || !UUID_PATTERN.test(input.userId)) return false
  const now = input.now ?? Date.now()
  const intent = await verifyReferralSignupIntent(input.intentToken, now)
  if (!intent || intent.source !== input.source) return false

  const userCreatedAt = input.userCreatedAt ? Date.parse(input.userCreatedAt) : NaN
  if (!Number.isFinite(userCreatedAt) || userCreatedAt <= intent.issuedAt || userCreatedAt > now) return false

  const nonceHash = await hashReferralSignupNonce(intent.nonce)
  if (!nonceHash) return false

  try {
    const admin = createAdminClient()
    const { data: consumed, error: consumeError } = await admin
      .from('referral_signup_intents')
      .update({ consumed_at: new Date(now).toISOString() })
      .eq('intent_hash', nonceHash)
      .eq('source', input.source)
      .is('consumed_at', null)
      .gt('expires_at', new Date(now).toISOString())
      .select('intent_hash')
      .maybeSingle()
    if (consumeError || !consumed) return false

    const cookieClaims = await verifyReferralCookieToken(input.referralCookie, now)
    if (!cookieClaims) return false
    return insertAttribution({ userId: input.userId, cookieClaims, source: input.source })
  } catch {
    return false
  }
}

export async function saveEmailReferralAtSignup(input: {
  userId: string
  intentToken: string | null
  referralCookie: string | null
  now?: number
}): Promise<boolean> {
  if (!isReferralRuntimeReady() || !UUID_PATTERN.test(input.userId)) return false
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(input.userId)
    const user = data?.user
    if (error || !user?.created_at) return false
    const createdAt = Date.parse(user.created_at)
    const now = input.now ?? Date.now()
    if (!Number.isFinite(createdAt) || createdAt > now || now - createdAt > EMAIL_SIGNUP_MAX_AGE_MS) return false

    return consumeSignupIntentAndAssign({
      userId: user.id,
      userCreatedAt: user.created_at,
      intentToken: input.intentToken,
      referralCookie: input.referralCookie,
      source: 'email',
      now,
    })
  } catch {
    return false
  }
}

export async function saveOAuthReferralAtSignup(input: {
  userId: string
  userCreatedAt: string | null | undefined
  intentToken: string | null
  referralCookie: string | null
  now?: number
}): Promise<boolean> {
  return consumeSignupIntentAndAssign({ ...input, source: 'oauth' })
}

export async function markReferralVerifiedForUser(userId: string): Promise<boolean> {
  if (!isReferralRuntimeReady() || !UUID_PATTERN.test(userId)) return false
  try {
    const { error } = await createAdminClient()
      .from('referral_attributions')
      .update({ verified_at: new Date().toISOString() })
      .eq('referred_user_id', userId)
      .is('verified_at', null)
    return !error
  } catch {
    return false
  }
}

export async function anonymizeReferralDataForDeletion(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const { error: attributionError } = await admin
    .from('referral_attributions')
    .update({ referred_user_id: null })
    .eq('referred_user_id', userId)
  if (attributionError) {
    if (isMissingReferralTable(attributionError)) return
    throw attributionError
  }

  const { error: partnerError } = await admin
    .from('referral_partners')
    .update({
      user_id: null,
      status: 'closed',
      payee_name: null,
      tax_status: null,
      iban_ciphertext: null,
      iban_key_version: null,
      iban_last4: null,
    })
    .eq('user_id', userId)
  if (partnerError) {
    if (isMissingReferralTable(partnerError)) return
    throw partnerError
  }
}
