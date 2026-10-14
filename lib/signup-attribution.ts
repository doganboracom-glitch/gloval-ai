'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeAttribution } from '@/lib/attribution'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NEW_USER_WINDOW_MS = 15 * 60 * 1000

/**
 * Binds the visitor's first-touch attribution to a freshly created account.
 *
 * Runs right after sign-up, when an unconfirmed user has no session yet, so the
 * caller cannot be authenticated. Instead the account must exist, be minutes
 * old, and the write is insert-only (first write wins), so this endpoint can
 * never overwrite attribution or touch established accounts. It never throws:
 * attribution must not break sign-up.
 */
export async function saveSignupAttribution(input: {
  userId: string
  attribution: unknown
}): Promise<{ ok: boolean }> {
  try {
    const attribution = sanitizeAttribution(input.attribution)
    if (!attribution || !UUID_RE.test(input.userId)) return { ok: false }

    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(input.userId)
    if (error || !data.user) return { ok: false }
    if (Date.now() - new Date(data.user.created_at).getTime() > NEW_USER_WINDOW_MS) return { ok: false }

    const { params } = attribution
    const { error: insertError } = await admin.from('signup_attribution').upsert(
      {
        user_id: input.userId,
        utm_source: params.utm_source ?? null,
        utm_medium: params.utm_medium ?? null,
        utm_campaign: params.utm_campaign ?? null,
        utm_term: params.utm_term ?? null,
        utm_content: params.utm_content ?? null,
        gclid: params.gclid ?? null,
        fbclid: params.fbclid ?? null,
        landing_path: attribution.landing_path,
        referrer_domain: attribution.referrer_domain,
        captured_at: new Date(attribution.captured_at).toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
    if (insertError) {
      console.log('[v0] saveSignupAttribution: insert failed', insertError.message)
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.log('[v0] saveSignupAttribution: unexpected error', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}
