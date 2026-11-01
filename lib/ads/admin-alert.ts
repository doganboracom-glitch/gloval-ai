import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionalEmail } from '@/lib/notify'
import { COMPANY } from '@/lib/legal/company'
import type { AdsRpcClient } from '@/lib/ads/credits'

export type AnonCapAlertKind = 'anon_global_cap_50' | 'anon_global_cap'
export type PolicyBlockAlertKind = 'policy_block_global_cap'
export type GooglePublishAlertKind = `google_publish_reconciling:${string}`
export type AdsAlertKind = AnonCapAlertKind | PolicyBlockAlertKind | GooglePublishAlertKind

export const ANON_CAP_ALERT_KIND = {
  half: 'anon_global_cap_50',
  full: 'anon_global_cap',
} as const satisfies Record<string, AnonCapAlertKind>

export const POLICY_BLOCK_CAP_ALERT_KIND: PolicyBlockAlertKind = 'policy_block_global_cap'
export const GOOGLE_PUBLISH_RECONCILING_ALERT_KIND = 'google_publish_reconciling'

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
    const subject =
      level === 'half'
        ? `GLOVAL Ads: anonim ücretsiz tarama kotasının %50'sine ulaşıldı (${cap})`
        : `GLOVAL Ads: anonim ücretsiz tarama kotası doldu (${cap})`
    const text =
      level === 'half'
        ? `Bugünkü anonim ücretsiz tarama sayısı tavanın yarısına ulaştı. Tavan: ${cap}. Gerekirse ADS_ANON_DAILY_CAP değerini gözden geçirin.`
        : `Bugünkü anonim ücretsiz tarama tavanı doldu. Tavan: ${cap}. Yeni misafir taramaları yarına kadar giriş ister.`
    await deps.sendEmail({
      subject,
      text,
      html: `<p>${text}</p>`,
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
    const subject = `GLOVAL Ads: günlük politika engeli sınırına ulaşıldı (${used}/${cap})`
    const text = `Günlük açık politika engeli deneme sınırına ulaşıldı. Kullanım: ${used}/${cap}. Yeni Ads AI istekleri yarına kadar bu sınır nedeniyle reddedilecek.`
    await deps.sendEmail({
      subject,
      text,
      html: `<p>${text}</p>`,
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
): Promise<void> {
  const kind: GooglePublishAlertKind = `${GOOGLE_PUBLISH_RECONCILING_ALERT_KIND}:${planId}`
  try {
    const first = await deps.recordOnce(kind, { planId, requestId })
    if (!first) return
    const subject = 'GLOVAL Ads: Google Ads yayın sonucu belirsiz'
    const text = `Google Ads kampanya oluşturma çağrısının sonucu doğrulanamadı. Plan: ${planId}; deneme: ${requestId}. Otomatik yeniden oluşturma ve kredi iadesi yapılmadı; yönetici mutabakatı gerekiyor.`
    await deps.sendEmail({
      subject,
      text,
      html: `<p>${text}</p>`,
      idempotencyKey: `${kind}-${istanbulDay()}`,
    })
  } catch (error) {
    console.error('[ads-alert] publish reconciliation notify failed:', error instanceof Error ? error.message : 'unknown')
  }
}
