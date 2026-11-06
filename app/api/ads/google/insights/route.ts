import { z } from 'zod'
import { GoogleAdsAnalysisLimitError, generateGoogleAdsAnalysis } from '@/lib/ads/google-ads-insight-analysis'
import { getGoogleAdsDatePeriod, parseGoogleAdsCustomPeriod, type GoogleAdsRangePreset } from '@/lib/ads/google-ads-insights-shared'
import { loadGoogleAdsInsights } from '@/lib/ads/google-ads-insights-server'
import { GoogleAdsError, googleAdsErrorResponse } from '@/lib/ads/google-ads-error'
import { GoogleAdsReportStorageError } from '@/lib/ads/google-ads-report-store'
import { googleAdsConnectAllowed, googleAdsFeatureEnabled, googleAdsJson, googleAdsNotFound, googleAdsUserId, isSameOriginGoogleAdsPost } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 90

const connectionIdSchema = z.string().uuid()
const analysisRequestSchema = z.object({
  connectionId: connectionIdSchema,
  range: z.enum(['7d', '30d', '90d', 'custom']),
  from: z.string().optional(),
  to: z.string().optional(),
}).strict()

function parseRange(range: string | null, from: string | null, to: string | null) {
  if (range === 'custom') return parseGoogleAdsCustomPeriod(from, to)
  if (range === '7d' || range === '30d' || range === '90d') return getGoogleAdsDatePeriod(range as GoogleAdsRangePreset)
  return null
}

function apiError(error: unknown) {
  if (error instanceof GoogleAdsReportStorageError) {
    return googleAdsJson({ ok: false, error: 'report_storage_unavailable' }, 503)
  }
  return googleAdsErrorResponse(error)
}

export async function GET(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsNotFound()
  const userId = await googleAdsUserId()
  if (!userId) return googleAdsJson({ ok: false, error: 'not_authenticated' }, 401)
  if (!googleAdsConnectAllowed(userId)) return googleAdsJson({ ok: false, error: 'not_authorized' }, 403)

  const url = new URL(request.url)
  const connectionId = connectionIdSchema.safeParse(url.searchParams.get('connectionId'))
  const range = parseRange(url.searchParams.get('range'), url.searchParams.get('from'), url.searchParams.get('to'))
  if (!connectionId.success || !range) return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)

  try {
    const loaded = await loadGoogleAdsInsights({
      userId,
      connectionId: connectionId.data,
      range,
      forceRefresh: url.searchParams.get('refresh') === '1',
    })
    return googleAdsJson({ ok: true, ...loaded })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsNotFound()
  if (!isSameOriginGoogleAdsPost(request)) return googleAdsJson({ ok: false, error: 'invalid_origin' }, 403)

  const userId = await googleAdsUserId()
  if (!userId) return googleAdsJson({ ok: false, error: 'not_authenticated' }, 401)
  if (!googleAdsConnectAllowed(userId)) return googleAdsJson({ ok: false, error: 'not_authorized' }, 403)

  const body = await request.json().catch(() => null)
  const parsed = analysisRequestSchema.safeParse(body)
  const range = parsed.success
    ? parseRange(parsed.data.range, parsed.data.from ?? null, parsed.data.to ?? null)
    : null
  if (!parsed.success || !range) return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)

  try {
    const loaded = await loadGoogleAdsInsights({
      userId,
      connectionId: parsed.data.connectionId,
      range,
    })
    const generated = await generateGoogleAdsAnalysis({
      userId,
      connectionId: parsed.data.connectionId,
      report: loaded.report,
    })
    return googleAdsJson({ ok: true, ...generated, refreshedAt: loaded.refreshedAt, stale: loaded.stale })
  } catch (error) {
    if (error instanceof GoogleAdsAnalysisLimitError) {
      return googleAdsJson({
        ok: false,
        error: 'analysis_daily_limit',
        used: error.used,
        limit: 3,
      }, 429)
    }
    if (error instanceof GoogleAdsReportStorageError) return apiError(error)
    if (error instanceof GoogleAdsError) return googleAdsErrorResponse(error)
    return googleAdsJson({ ok: false, error: 'analysis_unavailable' }, 502)
  }
}
