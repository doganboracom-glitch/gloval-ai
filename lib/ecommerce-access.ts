import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'

/** Requires an authenticated user; returns the Supabase client + user id. */
export async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return { supabase, userId: user.id }
}

/**
 * Resolves access to a single e-commerce project's data.
 *
 * Normal users stay on their RLS-scoped session client and can only ever reach
 * a project they own — behavior is completely unchanged. A verified admin
 * (server-side `ADMIN_EMAILS` allowlist) operating on a project they do NOT own
 * is elevated to the service-role client so the back office can manage ANY
 * tenant's catalog and orders. RLS is never weakened; elevation is gated by the
 * same allowlist that guards the admin panel and only for rows the caller
 * cannot already reach.
 *
 * `ownerId` is always the PROJECT's real owner (not the caller), so admin-created
 * categories/products are stamped with the correct owner_id and remain visible
 * to the tenant under their own RLS.
 *
 * Note: the returned key stays `supabase` so every existing call site keeps
 * working — it's a Supabase client either way, just at a different privilege.
 */
export async function requireOwnedEcommerceProject(projectId: string): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>
  userId: string
  elevated: boolean
}> {
  const { supabase, userId } = await requireUser()

  // Owner path (RLS): unchanged for normal users.
  const { data: owned, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (error) throw error
  if (owned) return { supabase, userId, elevated: false }

  // Admin path: verified admin editing another tenant's store.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (isAdminEmail(user?.email ?? null)) {
    const admin = createAdminClient()
    const { data: proj, error: pErr } = await admin
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (pErr) throw pErr
    if (!proj) throw new Error('NOT_FOUND')
    // userId = the project's real owner so inserts stamp the correct owner_id.
    return { supabase: admin, userId: proj.owner_id as string, elevated: true }
  }

  throw new Error('NOT_FOUND')
}
