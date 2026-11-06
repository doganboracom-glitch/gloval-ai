import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { sendTransactionalEmail } from '@/lib/notify'
import { createAdminClient } from '@/lib/supabase/admin'
import { googleAdsFeatureEnabled } from '@/lib/ads/google-route-utils'
import { resolveGoogleAdsAccess } from '@/lib/ads/env'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { loadGoogleAdsInsights } from '@/lib/ads/google-ads-insights-server'
import { getCachedGoogleAdsAnalysis } from '@/lib/ads/google-ads-insight-analysis'
import { buildGoogleAdsReportEmail } from '@/lib/ads/google-ads-report-email-template'
import { addGoogleAdsReportUnsubscribeToken, GoogleAdsReportStorageError, isGoogleAdsReportStillEnabled, listDueGoogleAdsReportPreferences, markGoogleAdsReportSent, type GoogleAdsReportFrequency } from '@/lib/ads/google-ads-report-store'
import { getGoogleAdsDatePeriod, type GoogleAdsDatePeriod } from '@/lib/ads/google-ads-insights-shared'

const MAX_REPORT_RECIPIENTS_PER_RUN = 1000

type ReportPeriod = GoogleAdsDatePeriod & { endDate: string }

function previousMonthPeriod(now: Date): ReportPeriod {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const previousMonthEnd = new Date(currentMonthStart.getTime() - 24 * 60 * 60 * 1000)
  const previousMonthStart = new Date(Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1))
  const priorMonthEnd = new Date(previousMonthStart.getTime() - 24 * 60 * 60 * 1000)
  const priorMonthStart = new Date(Date.UTC(priorMonthEnd.getUTCFullYear(), priorMonthEnd.getUTCMonth(), 1))
  const from = previousMonthStart.toISOString().slice(0, 10)
  const to = previousMonthEnd.toISOString().slice(0, 10)
  const previousFrom = priorMonthStart.toISOString().slice(0, 10)
  const previousTo = priorMonthEnd.toISOString().slice(0, 10)
  const days = Math.round((previousMonthEnd.getTime() - previousMonthStart.getTime()) / 86_400_000) + 1
  const previousDays = Math.round((priorMonthEnd.getTime() - priorMonthStart.getTime()) / 86_400_000) + 1
  return { from, to, previousFrom, previousTo, days, previousDays, endDate: to }
}

function reportPeriod(frequency: GoogleAdsReportFrequency, now: Date): ReportPeriod {
  if (frequency === 'monthly') return previousMonthPeriod(now)
  const period = getGoogleAdsDatePeriod('7d', now)
  return { ...period, previousDays: period.days, endDate: period.to }
}

function unsubscribeUrl(token: string, baseUrl: string): string {
  const url = new URL('/api/ads/google/reports/unsubscribe', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function userEmail(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const email = (user as { email?: unknown }).email
  return typeof email === 'string' && email.includes('@') ? email : null
}

export async function runGoogleAdsReportSweep(
  frequency: GoogleAdsReportFrequency,
  now = new Date(),
  baseUrl = 'https://gloval.ai',
): Promise<{ scanned: number; sent: number; skipped: number }> {
  if (!googleAdsFeatureEnabled()) return { scanned: 0, sent: 0, skipped: 0 }

  const period = reportPeriod(frequency, now)
  const preferences = await listDueGoogleAdsReportPreferences(frequency, period.endDate)
  const admin = createAdminClient()
  let sent = 0
  let skipped = 0
  const batch = preferences.slice(0, MAX_REPORT_RECIPIENTS_PER_RUN)
  let nextIndex = 0

  async function processPreference(preference: (typeof preferences)[number]): Promise<void> {
    try {
      if (!await isGoogleAdsReportStillEnabled(preference.userId, preference.connectionId, frequency)) {
        skipped += 1
        return
      }

      const { data: authUser, error: authError } = await admin.auth.admin.getUserById(preference.userId)
      const user = !authError ? authUser?.user : null
      const recipient = userEmail(user)
      if (!user || !recipient) {
        skipped += 1
        return
      }

      const decision = resolveGoogleAdsAccess(preference.userId, {
        emailConfirmed: Boolean(user.email_confirmed_at),
        isAdmin: isAdminEmail(user.email),
      })
      if (!decision.canConnect) {
        skipped += 1
        return
      }

      const loaded = await loadGoogleAdsInsights({
        userId: preference.userId,
        connectionId: preference.connectionId,
        range: period,
        bypassRefreshCooldown: true,
      })
      const analysis = await getCachedGoogleAdsAnalysis({
        userId: preference.userId,
        connectionId: preference.connectionId,
        report: loaded.report,
      }).catch(() => null)

      if (!await isGoogleAdsReportStillEnabled(preference.userId, preference.connectionId, frequency)) {
        skipped += 1
        return
      }

      const token = randomBytes(32).toString('base64url')
      await addGoogleAdsReportUnsubscribeToken(preference.userId, hashToken(token))
      const message = buildGoogleAdsReportEmail({
        frequencyLabel: frequency === 'weekly' ? 'Haftalık' : 'Aylık',
        report: loaded.report,
        analysis,
        dashboardUrl: new URL('/ads/dashboard', baseUrl).toString(),
        unsubscribeUrl: unsubscribeUrl(token, baseUrl),
      })
      const delivered = await sendTransactionalEmail({
        to: recipient,
        subject: message.subject,
        html: message.html,
        text: message.text,
        fromDisplayName: 'GLOVAL AI · Google Ads',
        idempotencyKey: `google-ads-report:${createHash('sha256').update(`${frequency}:${preference.userId}:${period.endDate}`).digest('hex')}`,
      })

      if (!delivered) {
        skipped += 1
        return
      }

      await markGoogleAdsReportSent(preference.userId, preference.connectionId, frequency, period.endDate)
      sent += 1
    } catch (error) {
      if (error instanceof GoogleAdsError || error instanceof GoogleAdsReportStorageError) {
        skipped += 1
        return
      }
      skipped += 1
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++
      const preference = batch[index]
      if (!preference) return
      await processPreference(preference)
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, batch.length) }, () => worker()))
  return { scanned: preferences.length, sent, skipped }
}
