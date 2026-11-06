import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleAdsError, googleAdsErrorCode, googleAdsHttpStatus } from '@/lib/ads/google-ads-error'
import { getGoogleAdsConnectionForUser } from '@/lib/ads/google-connections'
import { GoogleAdsReportStorageError, getGoogleAdsReportPreferences, saveGoogleAdsReportPreferences } from '@/lib/ads/google-ads-report-store'
import { googleAdsFeatureEnabled, googleAdsJson, googleAdsNotFound, googleAdsRequestAccess, isSameOriginGoogleAdsPost } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const preferenceSchema = z.object({
  connectionId: z.string().uuid(),
  weeklyEnabled: z.boolean(),
  monthlyEnabled: z.boolean(),
}).strict()

export async function GET(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsNotFound()
  const access = await googleAdsRequestAccess()
  if (!access) return googleAdsJson({ ok: false, error: 'not_authenticated' }, 401)
  if (!access.decision.canConnect) return googleAdsJson({ ok: false, error: 'not_authorized' }, 403)
  const userId = access.userId

  const connectionId = new URL(request.url).searchParams.get('connectionId')
  if (!connectionId || !z.string().uuid().safeParse(connectionId).success) {
    return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }

  try {
    const admin = createAdminClient()
    const [{ data: authUser, error: authError }, preferences] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      getGoogleAdsReportPreferences(userId),
    ])
    const email = !authError && typeof authUser?.user?.email === 'string' ? authUser.user.email.trim() : ''
    const emailConfigured = email.includes('@')
    const matches = preferences?.connectionId === connectionId
    return googleAdsJson({
      ok: true,
      emailConfigured,
      preferences: {
        connectionId,
        weeklyEnabled: matches ? preferences.weeklyEnabled : false,
        monthlyEnabled: matches ? preferences.monthlyEnabled : false,
      },
    })
  } catch (error) {
    if (error instanceof GoogleAdsReportStorageError) {
      return googleAdsJson({ ok: false, error: 'report_storage_unavailable' }, 503)
    }
    return googleAdsJson({ ok: false, error: 'provider_error' }, 500)
  }
}

export async function POST(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsNotFound()
  if (!isSameOriginGoogleAdsPost(request)) return googleAdsJson({ ok: false, error: 'invalid_origin' }, 403)

  const access = await googleAdsRequestAccess()
  if (!access) return googleAdsJson({ ok: false, error: 'not_authenticated' }, 401)
  if (!access.decision.canConnect) return googleAdsJson({ ok: false, error: 'not_authorized' }, 403)
  const userId = access.userId

  const body = await request.json().catch(() => null)
  const parsed = preferenceSchema.safeParse(body)
  if (!parsed.success) return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)

  try {
    const admin = createAdminClient()
    const connection = await getGoogleAdsConnectionForUser(admin, userId, parsed.data.connectionId)
    if (!connection) return googleAdsJson({ ok: false, error: 'connection_not_found' }, 404)
    if (connection.status !== 'active') return googleAdsJson({ ok: false, error: 'reauth_required' }, 409)
    if (connection.is_manager) return googleAdsJson({ ok: false, error: 'manager_account_not_supported' }, 400)

    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId)
    const email = !authError && typeof authUser?.user?.email === 'string' ? authUser.user.email.trim() : ''
    if (!email || !email.includes('@')) return googleAdsJson({ ok: false, error: 'email_unavailable' }, 422)

    await saveGoogleAdsReportPreferences({
      userId,
      connectionId: parsed.data.connectionId,
      weeklyEnabled: parsed.data.weeklyEnabled,
      monthlyEnabled: parsed.data.monthlyEnabled,
    })

    return googleAdsJson({ ok: true, preferences: parsed.data, emailConfigured: true })
  } catch (error) {
    if (error instanceof GoogleAdsReportStorageError) {
      return googleAdsJson({ ok: false, error: 'report_storage_unavailable' }, 503)
    }
    if (error instanceof GoogleAdsError) {
      const code = googleAdsErrorCode(error)
      return googleAdsJson({ ok: false, error: code }, googleAdsHttpStatus(code))
    }
    return googleAdsJson({ ok: false, error: 'provider_error' }, 500)
  }
}
