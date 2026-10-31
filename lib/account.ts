'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revokePendingGoogleAdsOAuthFlows } from '@/lib/ads/google-ads-oauth-server'
import {
  getDomainDeletionBlockers,
  hasDomainDeletionBlockers,
} from '@/lib/custom-domains/registrar/account-deletion-guard'
import {
  describeError,
  hostingDetachSteps,
  removeStoragePrefix,
  runCleanupSteps,
  siteAssetSteps,
  SITE_BUCKET,
  type Admin,
  type CleanupStep,
} from '@/lib/external-cleanup'

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
class DeleteStageError extends Error {
  constructor(readonly stage: string) {
    super(stage)
  }
}

function stageFailure(stage: string, error: unknown): never {
  console.error('[account-delete] stage failed', { stage, ...describeError(error) })
  throw new DeleteStageError(stage)
}

const SUPPORT_BUCKET = 'support-attachments'

type CleanupTargets = {
  projectIds: string[]
  email: string | null
  domains: string[]
  supportPaths: string[]
}

/**
 * Collects what must be removed from OUTSIDE the database (storage objects,
 * hosting domains) while the rows that point at them still exist. Best effort:
 * a lookup failure is logged and skipped, because orphaned files must never
 * block the user's right to delete their account.
 */
async function collectCleanupTargets(
  admin: Admin,
  userId: string,
  email: string | null,
  projectIds: string[],
): Promise<CleanupTargets> {
  const targets: CleanupTargets = { projectIds, email, domains: [], supportPaths: [] }

  const { data: domains, error: domainsError } = await admin.from('custom_domains').select('domain').eq('user_id', userId)
  if (domainsError) console.error('[account-delete] cleanup lookup failed', { step: 'domains', ...describeError(domainsError) })
  targets.domains = (domains ?? []).map((d) => String(d.domain).toLowerCase()).filter(Boolean)

  const { data: tickets, error: ticketsError } = await admin.from('support_tickets').select('id').eq('user_id', userId)
  if (ticketsError) console.error('[account-delete] cleanup lookup failed', { step: 'tickets', ...describeError(ticketsError) })
  const ticketIds = (tickets ?? []).map((t) => t.id as string)
  if (ticketIds.length > 0) {
    const { data: files, error: filesError } = await admin
      .from('support_ticket_attachments')
      .select('storage_path')
      .in('ticket_id', ticketIds)
    if (filesError) console.error('[account-delete] cleanup lookup failed', { step: 'attachments', ...describeError(filesError) })
    targets.supportPaths = (files ?? []).map((f) => f.storage_path as string)
  }
  return targets
}

/**
 * Post-deletion cleanup of everything the cascade cannot reach. Every step is
 * independent and failure-tolerant: the account is already gone by now, so a
 * failure is logged for follow-up instead of being reported to the user.
 */
async function cleanupExternalAssets(admin: Admin, userId: string, targets: CleanupTargets) {
  const steps: CleanupStep[] = []

  for (const projectId of targets.projectIds) steps.push(...siteAssetSteps(admin, projectId))
  steps.push(['previews', () => removeStoragePrefix(admin, SITE_BUCKET, `previews/${userId}`)])

  if (targets.supportPaths.length > 0) {
    steps.push([
      'support-attachments',
      async () => {
        const { error } = await admin.storage.from(SUPPORT_BUCKET).remove(targets.supportPaths)
        if (error) throw error
      },
    ])
  }

  steps.push(...hostingDetachSteps(targets.domains))

  if (targets.email) {
    steps.push([
      'signup-drafts',
      async () => {
        const { error } = await admin.from('signup_drafts').delete().eq('email', targets.email as string)
        if (error) throw error
      },
    ])
  }

  await runCleanupSteps('[account-delete]', steps)
}

const LIVE_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'suspended']

/**
 * Ends every live subscription BEFORE the rows are detached from the user, so
 * the lifecycle sweep and renewal settlement can never act on an anonymized
 * (user_id NULL) subscription. Renewals are user-initiated one-off iyzico
 * checkout payments (`renewSubscription`); the adapter has no recurring
 * provider-side subscription to cancel, so ending the row is what stops them.
 */
async function cancelLiveSubscriptions(admin: Admin, userId: string) {
  const { error } = await admin
    .from('billing_subscriptions')
    .update({ status: 'canceled', cancel_at_period_end: false })
    .eq('user_id', userId)
    .in('status', LIVE_SUBSCRIPTION_STATUSES)
  if (error) stageFailure('cancel_subscriptions', error)
}

async function anonymizeFinancialRecords(admin: Admin, userId: string): Promise<string[]> {
  await cancelLiveSubscriptions(admin, userId)

  const { data: ownedProjects, error: projectsError } = await admin
    .from('projects')
    .select('id')
    .eq('owner_id', userId)
  // Deleting the user cascades through these rows: a detach that silently failed would wipe the orders.
  if (projectsError) stageFailure('anonymize_projects', projectsError)
  const ownedProjectIds = (ownedProjects ?? []).map((p) => p.id as string)

  const { error: ordersError } = await admin
    .from('ecommerce_orders')
    .update({ owner_id: null, project_id: null })
    .eq('owner_id', userId)
  if (ordersError) stageFailure('anonymize_orders', ordersError)

  if (ownedProjectIds.length > 0) {
    const { error: itemsError } = await admin
      .from('ecommerce_order_items')
      .update({ project_id: null })
      .in('project_id', ownedProjectIds)
    if (itemsError) stageFailure('anonymize_order_items', itemsError)
  }

  for (const table of ['billing_subscriptions', 'billing_transactions', 'addon_purchases', 'domain_orders'] as const) {
    const { error } = await admin.from(table).update({ user_id: null }).eq('user_id', userId)
    if (error) stageFailure(`anonymize_${table}`, error)
  }

  return ownedProjectIds
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
    const blockers = await getDomainDeletionBlockers(admin, user.id)
    if (hasDomainDeletionBlockers(blockers)) return { ok: false, error: 'domains_block_deletion' }
  } catch (error) {
    console.error('[account-delete] domain guard failed', describeError(error))
    return { ok: false, error: 'delete_failed' }
  }

  try {
    await revokePendingGoogleAdsOAuthFlows(admin, user.id)
  } catch {
    console.error('[account-delete] Google Ads OAuth cleanup failed', { stage: 'google_ads_oauth_revoke' })
    return { ok: false, error: 'delete_failed' }
  }

  let targets: CleanupTargets
  try {
    const projectIds = await anonymizeFinancialRecords(admin, user.id)
    targets = await collectCleanupTargets(admin, user.id, user.email?.toLowerCase() ?? null, projectIds)
  } catch (error) {
    if (!(error instanceof DeleteStageError)) {
      console.error('[account-delete] unexpected failure', describeError(error))
    }
    return { ok: false, error: 'delete_failed' }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[account-delete] stage failed', { stage: 'auth_delete_user', ...describeError(error) })
    return { ok: false, error: 'delete_failed' }
  }

  await cleanupExternalAssets(admin, user.id, targets)

  return { ok: true }
}
