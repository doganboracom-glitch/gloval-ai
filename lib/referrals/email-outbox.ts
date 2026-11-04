import 'server-only'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionalEmailDetailed } from '@/lib/notify'
import { maskEmail } from '@/lib/store-order-privacy'
import { buildReferralPayoutNoticeEmail, type ReferralPayoutNoticeType } from '@/lib/email/referral-payout-mail'
import { isReferralFeatureEnabled, isReferralPayoutsEnabled } from '@/lib/referrals/core'

const REFERRAL_EMAIL_TYPES: readonly ReferralPayoutNoticeType[] = [
  'referral_partner_signup',
  'referral_partner_signup_digest',
  'referral_commission_earned',
  'referral_cash_requested',
  'referral_cash_paid',
  'referral_cash_rejected',
  'referral_credit_converted',
  'referral_tax_verification_required',
]
const MAX_ATTEMPTS = 4
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

type ReferralOutboxState = {
  lang: 'tr' | 'en'
  attempts: number
  partnerId: string
  attributionId?: string
  commissionCents?: number
  amountCents?: number
  availableAt?: string
  creditAmount?: number
  systemTopupCents?: number
  signupCount?: number
  windowEndsAt?: string
}

type ReferralOutboxJob = {
  id: string
  type: string
  status: string
  body: string
  dedupe_key: string
  created_at: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseState(value: unknown): ReferralOutboxState | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) return null
    if (parsed.lang !== 'tr' && parsed.lang !== 'en') return null
    if (!Number.isSafeInteger(parsed.attempts) || Number(parsed.attempts) < 0) return null
    if (typeof parsed.partnerId !== 'string' || !UUID_PATTERN.test(parsed.partnerId)) return null

    const optionalInteger = (key: string) => {
      const field = parsed[key]
      return field == null || (Number.isSafeInteger(field) && Number(field) >= 0)
    }
    if (
      !optionalInteger('commissionCents') ||
      !optionalInteger('amountCents') ||
      !optionalInteger('creditAmount') ||
      !optionalInteger('systemTopupCents') ||
      !optionalInteger('signupCount')
    ) return null

    const state: ReferralOutboxState = {
      lang: parsed.lang,
      attempts: Number(parsed.attempts),
      partnerId: parsed.partnerId,
    }
    if (typeof parsed.attributionId === 'string' && UUID_PATTERN.test(parsed.attributionId)) {
      state.attributionId = parsed.attributionId
    }
    for (const key of ['commissionCents', 'amountCents', 'creditAmount', 'systemTopupCents', 'signupCount'] as const) {
      const field = parsed[key]
      if (typeof field === 'number') state[key] = field
    }
    for (const key of ['availableAt', 'windowEndsAt'] as const) {
      const field = parsed[key]
      if (typeof field === 'string' && Number.isFinite(Date.parse(field))) state[key] = field
    }
    return state
  } catch {
    return null
  }
}

function isReferralEmailType(value: string): value is ReferralPayoutNoticeType {
  return REFERRAL_EMAIL_TYPES.includes(value as ReferralPayoutNoticeType)
}

function emailTypeFromDedupeKey(dedupeKey: string): ReferralPayoutNoticeType | null {
  return REFERRAL_EMAIL_TYPES.find((type) => dedupeKey.startsWith(`${type}:`)) ?? null
}

async function getSignupEmailDetails(
  admin: ReturnType<typeof createAdminClient>,
  attributionId: string | undefined,
  fallbackDate: string,
) {
  if (!attributionId) return { maskedEmail: null, signupDate: fallbackDate }
  const { data: attribution, error } = await admin
    .from('referral_attributions')
    .select('referred_user_id,created_at')
    .eq('id', attributionId)
    .maybeSingle()
  if (error || !attribution) return { maskedEmail: null, signupDate: fallbackDate }

  const signupDate = typeof attribution.created_at === 'string' && Number.isFinite(Date.parse(attribution.created_at))
    ? attribution.created_at
    : fallbackDate
  if (typeof attribution.referred_user_id !== 'string' || !UUID_PATTERN.test(attribution.referred_user_id)) {
    return { maskedEmail: null, signupDate }
  }

  const { data, error: userError } = await admin.auth.admin.getUserById(attribution.referred_user_id)
  return {
    maskedEmail: userError ? null : maskEmail(data.user?.email ?? null),
    signupDate,
  }
}

async function setJobState(
  id: string,
  status: 'queued' | 'failed' | 'sent',
  state: ReferralOutboxState,
) {
  await createAdminClient()
    .from('notification_logs')
    .update({ status, body: JSON.stringify(state) })
    .eq('id', id)
}

export async function queueReferralPartnerSignupNotification(attributionId: string) {
  if (!isReferralFeatureEnabled() || !UUID_PATTERN.test(attributionId)) return

  try {
    const { data, error } = await createAdminClient().rpc('referral_queue_signup_notification', {
      p_attribution_id: attributionId,
    })
    if (error) return

    const row = Array.isArray(data) ? data[0] : data
    if (!isRecord(row) || typeof row.dedupeKey !== 'string') return
    const type = typeof row.type === 'string' ? row.type : ''
    if (!isReferralEmailType(type) || !row.dedupeKey.startsWith(`${type}:`)) return

    after(async () => {
      await deliverReferralEmailByDedupeKey(row.dedupeKey as string)
    })
  } catch {
    // Referral notification delivery must not block account creation.
  }
}

export async function queueReferralPayoutNotification(input: {
  type: Exclude<ReferralPayoutNoticeType, 'referral_partner_signup' | 'referral_partner_signup_digest' | 'referral_commission_earned'>
  partnerId: string
  payoutRequestId: string
  lang: 'tr' | 'en'
  amountCents?: number
  creditAmount?: number
  systemTopupCents?: number
}) {
  if (!isReferralPayoutsEnabled()) return
  if (!UUID_PATTERN.test(input.partnerId) || !UUID_PATTERN.test(input.payoutRequestId)) return

  const state: ReferralOutboxState = {
    lang: input.lang === 'en' ? 'en' : 'tr',
    attempts: 0,
    partnerId: input.partnerId,
    ...(Number.isSafeInteger(input.amountCents) && input.amountCents! >= 0
      ? { amountCents: input.amountCents }
      : {}),
    ...(Number.isSafeInteger(input.creditAmount) && input.creditAmount! >= 0
      ? { creditAmount: input.creditAmount }
      : {}),
    ...(Number.isSafeInteger(input.systemTopupCents) && input.systemTopupCents! >= 0
      ? { systemTopupCents: input.systemTopupCents }
      : {}),
  }
  const dedupeKey = `${input.type}:${input.payoutRequestId}`

  try {
    const { error } = await createAdminClient().from('notification_logs').insert([{
      user_id: null,
      channel: 'email',
      type: input.type,
      subject: input.type,
      body: JSON.stringify(state),
      status: 'queued',
      dedupe_key: dedupeKey,
    }])
    if (error) {
      if (error.code !== '23505') console.error('[referral-email] queue failed:', error.code ?? 'unknown')
      return
    }

    after(async () => {
      await deliverReferralEmailByDedupeKey(dedupeKey)
    })
  } catch {
    console.error('[referral-email] queue failed')
  }
}

async function deliverReferralEmailByDedupeKey(dedupeKey: string) {
  const type = emailTypeFromDedupeKey(dedupeKey)
  if (!type || dedupeKey.length > 180) return 'skipped' as const

  const admin = createAdminClient()
  const { data: rawJob, error: jobError } = await admin
    .from('notification_logs')
    .select('id, type, status, body, dedupe_key, created_at')
    .eq('dedupe_key', dedupeKey)
    .eq('type', type)
    .maybeSingle()

  if (jobError || !rawJob || rawJob.status === 'sent') return 'skipped' as const
  const job = rawJob as ReferralOutboxJob
  const previousState = parseState(job.body)
  if (!previousState) {
    await admin.from('notification_logs').update({ status: 'failed' }).eq('id', job.id)
    return 'gave_up' as const
  }
  if (previousState.attempts >= MAX_ATTEMPTS) return 'gave_up' as const
  if (type === 'referral_partner_signup_digest') {
    if (!previousState.windowEndsAt || Date.parse(previousState.windowEndsAt) > Date.now()) {
      return 'deferred' as const
    }
  }

  const nextState = { ...previousState, attempts: previousState.attempts + 1 }
  const { data: claim, error: claimError } = await admin
    .from('notification_logs')
    .update({ status: 'queued', body: JSON.stringify(nextState) })
    .eq('id', job.id)
    .eq('body', job.body)
    .neq('status', 'sent')
    .select('id')
    .maybeSingle()

  if (claimError || !claim) return 'skipped' as const

  let recipient: string | null = null
  if (type === 'referral_cash_admin') {
    recipient = process.env.ADMIN_NOTIFICATION_EMAIL?.split(',')[0]?.trim() || null
    if (!recipient) {
      await setJobState(job.id, 'queued', previousState)
      return 'retry' as const
    }
  } else {
    const { data: partner, error: partnerError } = await admin
      .from('referral_partners')
      .select('user_id,preferred_language')
      .eq('id', previousState.partnerId)
      .maybeSingle()

    if (partnerError || !partner || !partner.user_id) {
      await setJobState(job.id, 'sent', { ...nextState })
      return 'skipped' as const
    }

    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(partner.user_id)
    recipient = authError ? null : authUser.user?.email ?? null
    if (!recipient) {
      await setJobState(job.id, 'sent', { ...nextState })
      return 'skipped' as const
    }
  }

  const requestReference = type === 'referral_cash_admin' ? dedupeKey.slice(type.length + 1) : undefined
  const signupDetails = type === 'referral_partner_signup'
    ? await getSignupEmailDetails(admin, previousState.attributionId, job.created_at)
    : null
  const email = buildReferralPayoutNoticeEmail({
    lang: previousState.lang,
    type,
    amountCents: previousState.amountCents,
    commissionCents: previousState.commissionCents,
    availableAt: previousState.availableAt,
    creditAmount: previousState.creditAmount,
    systemTopupCents: previousState.systemTopupCents,
    signupCount: previousState.signupCount,
    requestReference,
    maskedEmail: signupDetails?.maskedEmail,
    signupDate: signupDetails?.signupDate,
  })
  const result = await sendTransactionalEmailDetailed({
    to: recipient,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromDisplayName: 'GLOVAL AI',
    idempotencyKey: `referral-notice:${job.id}`,
  })

  if (result.ok) {
    await setJobState(job.id, 'sent', nextState)
    return 'sent' as const
  }

  if (result.reason === 'not_configured') {
    await setJobState(job.id, 'queued', previousState)
    return 'retry' as const
  }

  const permanentHttpFailure = result.reason === 'http' && result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429
  const failedState = permanentHttpFailure ? { ...nextState, attempts: MAX_ATTEMPTS } : nextState
  await setJobState(job.id, 'failed', failedState)
  return failedState.attempts >= MAX_ATTEMPTS ? 'gave_up' as const : 'retry' as const
}

export async function processReferralEmails({ deadlineMs }: { deadlineMs: number }) {
  const admin = createAdminClient()
  const oldest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: jobs, error } = await admin
    .from('notification_logs')
    .select('id, type, status, body, dedupe_key, created_at')
    .in('type', [...REFERRAL_EMAIL_TYPES])
    .in('status', ['queued', 'failed'])
    .gte('created_at', oldest)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error || !jobs) {
    return { scanned: 0, sent: 0, retry: 0, deferred: 0, gaveUp: 0 }
  }

  const result = { scanned: jobs.length, sent: 0, retry: 0, deferred: 0, gaveUp: 0 }
  for (const job of jobs as ReferralOutboxJob[]) {
    if (Date.now() >= deadlineMs) break
    if (!isReferralEmailType(job.type) || typeof job.dedupe_key !== 'string') continue
    const delivery = await deliverReferralEmailByDedupeKey(job.dedupe_key)
    if (delivery === 'sent') result.sent += 1
    if (delivery === 'retry') result.retry += 1
    if (delivery === 'deferred') result.deferred += 1
    if (delivery === 'gave_up') result.gaveUp += 1
  }
  return result
}
