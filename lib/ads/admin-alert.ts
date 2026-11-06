import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionalEmail } from '@/lib/notify'
import { COMPANY } from '@/lib/legal/company'
import type { AdsRpcClient } from '@/lib/ads/credits'
import {
  buildAdsAdminCapEmail,
  buildAdsAdminPublishFailureEmail,
  buildAdsAdminReconcilingEmail,
} from '@/lib/email/ads-mail'
import {
  sanitizeGoogleErrorDetails,
  summarizeGoogleErrors,
  type GoogleErrorDetail,
} from '@/lib/ads/google-error-detail'

export type AnonCapAlertKind = 'anon_global_cap_50' | 'anon_global_cap'
export type PolicyBlockAlertKind = 'policy_block_global_cap'
export type GooglePublishAlertKind = `google_publish_reconciling:${string}`
export type GooglePublishFailureAlertKind = `google_publish_failure:${string}`
export type GooglePublishFailureStage = 'validate_only' | 'publish'
export type GooglePublishReconciliationReason =
  | 'google_publish_result_unknown'
  | 'publish_result_persist_failed'
  | 'publish_failure_persist_failed'
  | 'publish_reservation_result_unknown'
  | 'publish_stale_timeout'
  | 'publish_refund_failed'
export type AdsAlertKind =
  | AnonCapAlertKind
  | PolicyBlockAlertKind
  | GooglePublishAlertKind
  | GooglePublishFailureAlertKind

export const ANON_CAP_ALERT_KIND = {
  half: 'anon_global_cap_50',
  full: 'anon_global_cap',
} as const satisfies Record<string, AnonCapAlertKind>

export const POLICY_BLOCK_CAP_ALERT_KIND: PolicyBlockAlertKind = 'policy_block_global_cap'
export const GOOGLE_PUBLISH_RECONCILING_ALERT_KIND = 'google_publish_reconciling'
export const GOOGLE_PUBLISH_FAILURE_ALERT_KIND = 'google_publish_failure'

/** Number of anonymous free actions at which the 50 % warning fires. */
export function halfCapThreshold(cap: number): number {
  return Math.max(1, Math.ceil(cap / 2))
}

export type AdsAlertDeps = {
  recordOnce: (kind: AdsAlertKind, detail: Record<string, unknown>) => Promise<boolean>
  sendEmail: (input: { subject: string; text: string; html: string; idempotencyKey: string }) => Promise<void>
}

async function recordOnce(kind: AdsAlertKind, detail: Record<string, unknown>): Promise<boolean> {
  const client = createAdminClient() as unknown as AdsRpcClient
  const { data, error } = await client.rpc('ads_record_alert_once', { p_kind: kind, p_detail: detail }).maybeSingle()
  if (error) {
    console.error('[ads-alert] record failed:', error.message)
    return false
  }
  return data === true
}

async function sendEmail(input: { subject: string; text: string; html: string; idempotencyKey: string }) {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || COMPANY.supportEmail
  await sendTransactionalEmail({ to, ...input })
}

const defaultDeps: AdsAlertDeps = { recordOnce, sendEmail }

function istanbulDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

/**
 * Sends the admin email only for the first call of a kind on an Istanbul day.
 * Contains no personal data. Never throws: an alert failure must not fail a scan.
 */
export async function notifyAnonCap(
  level: 'half' | 'full',
  cap: number,
  deps: AdsAlertDeps = defaultDeps,
): Promise<void> {
  const kind = ANON_CAP_ALERT_KIND[level]
  try {
    const first = await deps.recordOnce(kind, { cap })
    if (!first) return
    const mail = buildAdsAdminCapEmail(level === 'half' ? 'anon_half' : 'anon_full', { cap })
    await deps.sendEmail({
      ...mail,
      idempotencyKey: `${kind}-${new Date().toISOString().slice(0, 10)}`,
    })
  } catch (error) {
    console.error('[ads-alert] notify failed:', error instanceof Error ? error.message : 'unknown')
  }
}

/** Sends a once-daily email when the global explicit-policy-block allowance is reached. */
export async function notifyPolicyBlockCap(
  cap: number,
  used: number,
  deps: AdsAlertDeps = defaultDeps,
): Promise<void> {
  const kind = POLICY_BLOCK_CAP_ALERT_KIND
  try {
    const first = await deps.recordOnce(kind, { cap, used })
    if (!first) return
    await deps.sendEmail({
      ...buildAdsAdminCapEmail('policy_block', { cap, used }),
      idempotencyKey: `${kind}-${istanbulDay()}`,
    })
  } catch (error) {
    console.error('[ads-alert] policy cap notify failed:', error instanceof Error ? error.message : 'unknown')
  }
}

/** Emits one daily, PII-free admin alert for an ambiguous Google Ads create. */
export async function notifyGooglePublishReconciling(
  planId: string,
  requestId: string,
  deps: AdsAlertDeps = defaultDeps,
  reason: GooglePublishReconciliationReason = 'google_publish_result_unknown',
): Promise<void> {
  const kind: GooglePublishAlertKind = `${GOOGLE_PUBLISH_RECONCILING_ALERT_KIND}:${planId}`
  try {
    const first = await deps.recordOnce(kind, { planId, requestId, reason })
    if (!first) return
    await deps.sendEmail({
      ...buildAdsAdminReconcilingEmail({ planId, requestId, reason }),
      idempotencyKey: `${kind}-${istanbulDay()}`,
    })
  } catch (error) {
    console.error('[ads-alert] publish reconciliation notify failed:', error instanceof Error ? error.message : 'unknown')
  }
}

/** Sends a once-daily admin alert for a safe, non-ambiguous Google Ads operation error. */
export async function notifyGooglePublishFailure(
  planId: string,
  requestId: string,
  reason: string,
  stage: GooglePublishFailureStage,
  deps: AdsAlertDeps = defaultDeps,
  googleErrors: readonly GoogleErrorDetail[] = [],
): Promise<void> {
  const kind: GooglePublishFailureAlertKind = `${GOOGLE_PUBLISH_FAILURE_ALERT_KIND}:${planId}`
  const safeReason = /^[a-z][a-z0-9_]{0,63}$/.test(reason) ? reason : 'provider_error'
  // Only enum codes and field paths; Google's free-text messages never reach the e-mail.
  const googleSummary = summarizeGoogleErrors(sanitizeGoogleErrorDetails(googleErrors))
  try {
    const first = await deps.recordOnce(kind, {
      planId,
      requestId,
      reason: safeReason,
      stage,
      ...(googleSummary ? { googleErrors: googleSummary } : {}),
    })
    if (!first) return
    await deps.sendEmail({
      ...buildAdsAdminPublishFailureEmail({
        planId,
        requestId,
        reason: safeReason,
        stage,
        ...(googleSummary ? { googleSummary } : {}),
      }),
      idempotencyKey: `${kind}-${istanbulDay()}`,
    })
  } catch (error) {
    console.error('[ads-alert] publish failure notify failed:', error instanceof Error ? error.message : 'unknown')
  }
}
