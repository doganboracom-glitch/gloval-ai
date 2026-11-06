import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleAdsError, googleAdsErrorResponse } from '@/lib/ads/google-ads-error'
import { getGoogleAdsConnectionForUser } from '@/lib/ads/google-connections'
import { GoogleAdsReportStorageError, getGoogleAdsReportPreferences, saveGoogleAdsReportPreferences } from '@/lib/ads/google-ads-report-store'
import { googleAdsConnectAllowed, googleAdsFeatureEnabled, googleAdsJson, googleAdsNotFound, googleAdsUserId, isSameOriginGoogleAdsPost } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const preferenceSchema = z.object({
  connectionId: z.string().uuid(),
  weeklyEnabled: z.boolean(),
  monthlyEnabled: z.boolean(),
}).strict()

export async function GET(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsNotFound()
  const userId = await googleAdsUserId()
  if (!userId) return googleAdsJson({ ok: false, error: 'not_authenticated' }, 401)
  if (!googleAdsConnectAllowed(userId)) return googleAdsJson({ ok: false, error: 'not_authorized' }, 403)

  const connectionId = new URL(request.url).searchParams.get('connectionId')
  if (!connectionId || !z.string().uuid().safeParse(connectionId).success) {
    return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }

  try {
    const preferences = await getGoogleAdsReportPreferences(userId)
    const matches = preferences?.connectionId === connectionId
    return googleAdsJson({
      ok: true,
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

  const userId = await googleAdsUserId()
  if (!userId) return googleAdsJson({ ok: false, error: 'not_authenticated' }, 401)
  if (!googleAdsConnectAllowed(userId)) return googleAdsJson({ ok: false, error: 'not_authorized' }, 403)

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
    if (error instanceof GoogleAdsError) return googleAdsErrorResponse(error)
    return googleAdsJson({ ok: false, error: 'provider_error' }, 500)
  }
}
