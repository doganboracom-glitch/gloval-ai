import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  AUTH_RETRY_AFTER_SECONDS,
  getUserAuthState,
} from '@/lib/supabase/auth-state'

/**
 * First line of editor endpoints, before request parsing and any quota or
 * credit work. Definite unauthenticated requests receive 401; transient Auth
 * outages receive 503 so they are not mistaken for a signed-out user.
 */
export async function rejectAnonymous(): Promise<Response | null> {
  const supabase = await createClient()
  const authState = await getUserAuthState(supabase)
  if (authState.kind === 'authenticated') return null

  if (authState.kind === 'unavailable') {
    return Response.json(
      { error: 'Authentication temporarily unavailable' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(AUTH_RETRY_AFTER_SECONDS),
        },
      },
    )
  }

  return Response.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}
