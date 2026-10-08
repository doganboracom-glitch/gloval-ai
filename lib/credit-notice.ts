/**
 * "Hesabınıza X yapay zeka işlemi eklendi" notice, shared by the writer
 * (instant plan-credit grant) and the reader (dashboard / billing toast).
 *
 * The notice is stored in `notification_logs` with Turkish text, so the admin
 * "Bildirimler" screen reads naturally. The toast re-renders it in the viewer's
 * language: the amount is recovered from the stored body (the only number in
 * it) and the first-period flag from the row `type`.
 */

export const CREDIT_NOTICE_TYPE_FIRST = 'plan_credits_first'
export const CREDIT_NOTICE_TYPE_PERIOD = 'plan_credits_period'
export const CREDIT_NOTICE_TYPES = [CREDIT_NOTICE_TYPE_FIRST, CREDIT_NOTICE_TYPE_PERIOD] as const

/** A notice older than this is no longer worth surfacing as a toast. */
export const CREDIT_NOTICE_MAX_AGE_DAYS = 7

/** Cookie that remembers which notice the user already dismissed. */
export const CREDIT_NOTICE_SEEN_COOKIE = 'gloval_credit_notice_seen'

export type CreditNoticeLang = 'tr' | 'en'

export function creditNoticeText(lang: CreditNoticeLang, amount: number, firstPeriod: boolean): string {
  const n = amount.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')
  if (lang === 'tr') {
    return firstPeriod
      ? `Aboneliğiniz başladı, hesabınıza ${n} yapay zeka işlemi eklendi`
      : `Hesabınıza ${n} yapay zeka işlemi eklendi`
  }
  return firstPeriod
    ? `Your subscription has started, ${n} AI actions were added to your account`
    : `${n} AI actions were added to your account`
}

/** Dedupe key: one notice per subscription and credit period. */
export function creditNoticeDedupeKey(subscriptionId: string, periodStartIso: string): string {
  return `plan_credits:${subscriptionId}:${periodStartIso}`
}

/** Row written to `notification_logs` (Turkish, for the admin screen). */
export function buildCreditNotice(input: { amount: number; firstPeriod: boolean }) {
  return {
    type: input.firstPeriod ? CREDIT_NOTICE_TYPE_FIRST : CREDIT_NOTICE_TYPE_PERIOD,
    subject: 'Yapay zeka işlemleri eklendi',
    // Plain integer on purpose: `parseCreditNoticeAmount` reads it back.
    body: creditNoticeText('tr', input.amount, input.firstPeriod).replace(/\./g, ''),
  }
}

export function parseCreditNoticeAmount(body: string | null | undefined): number | null {
  const match = body?.match(/\d+/)
  if (!match) return null
  const amount = Number(match[0])
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export type CreditNoticeView = { id: string; amount: number; firstPeriod: boolean }
