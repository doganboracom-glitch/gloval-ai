import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'

/**
 * Verifies the caller owns the project (or is an allow-listed admin) and
 * returns the owner id plus the acting user id. Throws UNAUTHENTICATED /
 * NOT_FOUND; callers must run this BEFORE any service-role read or write.
 */
export async function authorizeProjectOwner(
  projectId: string,
): Promise<{ ownerId: string; actorId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')

  const { data: owned } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned) return { ownerId: owned.owner_id as string, actorId: user.id }

  if (isAdminEmail(user.email ?? null)) {
    const admin = createAdminClient()
    const { data: proj } = await admin
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (proj) return { ownerId: proj.owner_id as string, actorId: user.id }
  }
  throw new Error('NOT_FOUND')
}
