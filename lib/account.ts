'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type DeleteAccountResult = { ok: true } | { ok: false; error: string }
export type UpdateProfileResult = { ok: true } | { ok: false; error: string }

/**
 * Updates the CURRENT user's own display name. Runs through the regular
 * (RLS-scoped) server client, so a user can only ever update their own
 * `profiles` row.
 */
export async function updateOwnProfile(input: { fullName: string }): Promise<UpdateProfileResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const fullName = input.fullName.trim()
  if (!fullName) return { ok: false, error: 'invalid_name' }
  if (fullName.length > 120) return { ok: false, error: 'invalid_name' }

  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
  if (error) return { ok: false, error: 'update_failed' }

  return { ok: true }
}

/**
 * Detaches (but does not delete) financial and e-commerce records that must
 * be retained for accounting/legal purposes before the user's account is
 * permanently destroyed:
 *
 *  - `billing_subscriptions` / `billing_transactions` — payment history.
 *    `user_id` is nullable and ON DELETE CASCADE; nulling it first means the
 *    row survives the user's deletion instead of being cascade-removed.
 *  - `ecommerce_orders` — orders placed on a store this user owned.
 *    `owner_id` (-> auth.users) and `project_id` (-> projects) are both
 *    nullable and CASCADE; both must be cleared before the user/project rows
 *    are removed, or the order (and its financial totals) disappears with
 *    them.
 *  - `ecommerce_order_items` — same reasoning for `project_id`, scoped to the
 *    projects this user owned (queried before those projects are deleted).
 *
 * This intentionally does NOT touch `store_customers` rows where this user
 * was the *buyer* on someone else's store — that is the user's own purchase
 * history and is expected to be removed with the rest of their account.
 */
async function anonymizeFinancialRecords(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: ownedProjects } = await admin.from('projects').select('id').eq('user_id', userId)
  const ownedProjectIds = (ownedProjects ?? []).map((p) => p.id as string)

  await admin
    .from('ecommerce_orders')
    .update({ owner_id: null, project_id: null })
    .eq('owner_id', userId)

  if (ownedProjectIds.length > 0) {
    await admin
      .from('ecommerce_order_items')
      .update({ project_id: null })
      .in('project_id', ownedProjectIds)
  }

  await admin.from('billing_subscriptions').update({ user_id: null }).eq('user_id', userId)
  await admin.from('billing_transactions').update({ user_id: null }).eq('user_id', userId)
}

/**
 * Permanently deletes the CURRENT user's own account, self-service, with no
 * grace period. Before the destructive step, financial and e-commerce
 * records that must be retained (see `anonymizeFinancialRecords`) are
 * detached from the user so they survive the cascade instead of being wiped.
 *
 * After that, `auth.admin.deleteUser` cascades through the rest of the FK
 * chain rooted at auth.users -> public.profiles (verified: profiles,
 * projects, and every table owned by a project or user — entitlements,
 * domains, mail, support tickets, etc. — cascade on delete; only a couple of
 * audit/log tables intentionally SET NULL instead). There is nothing left to
 * clean up manually afterwards.
 *
 * Runs through the service-role client because deleting an auth user (and
 * detaching rows owned by other tables) requires the admin API; the caller's
 * identity is re-verified server-side via their own session first, so a user
 * can only ever delete themselves.
 */
export async function deleteOwnAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const admin = createAdminClient()

  try {
    await anonymizeFinancialRecords(admin, user.id)
  } catch {
    return { ok: false, error: 'delete_failed' }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return { ok: false, error: 'delete_failed' }

  return { ok: true }
}
