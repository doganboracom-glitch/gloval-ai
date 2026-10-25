import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * First line of every editor endpoint (AI generation, AI editing, image
 * upload/generation, store AI tools). An anonymous caller is turned away with
 * 401 BEFORE the body is parsed and before any plan, quota or credit logic
 * runs, so nothing here can be probed or spent without a session.
 *
 * Returns a ready 401 Response for anonymous callers, `null` when a session
 * exists (the route then does its own ownership / credit checks).
 */
export async function rejectAnonymous(): Promise<Response | null> {
  let hasUser = false
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    hasUser = !error && Boolean(data?.user)
  } catch {
    hasUser = false
  }
  if (hasUser) return null
  return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
}
