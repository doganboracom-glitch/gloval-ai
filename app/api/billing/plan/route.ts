import { createClient } from '@/lib/supabase/server'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'

export const dynamic = 'force-dynamic'

/**
 * Plan of the current visitor, for UI hints only (e.g. the advanced-AI badge).
 * Anonymous visitors are `free`. Authorization never relies on this: every AI
 * route resolves the plan on the server again.
 */
export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) {
    return Response.json({ planCode: 'free' }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const planCode = toPlanCode(await getPlanCodeForUser(user.id))
  return Response.json({ planCode }, { headers: { 'Cache-Control': 'no-store' } })
}
