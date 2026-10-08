import { createAdminClient } from '@/lib/supabase/admin'
import { planIncludesMail, subscriptionSourceEndsAt, type MailAccessSource } from './access-state'
import {
  grantsToAccessSources,
  type MailAddonGrant,
  type MailGrants,
  type MailPlanGrant,
} from './mailbox-limits'

/**
 * Where the two mail-access sources are read from. Server only; takes a user id
 * that comes from our own tables, never from a request.
 */

const ENTITLING_STATUSES = new Set(['trialing', 'active', 'past_due'])

type SubscriptionRow = {
  status: string
  current_period_end: string | null
  trial_ends_at?: string | null
  grace_period_ends_at: string | null
  updated_at: string | null
  billing_plans: { code: string } | { code: string }[] | null
}

/** Source 1: a main package that includes mail. `incomplete` rows never had access and are skipped. */
export async function loadMailPlanSources(userId: string): Promise<MailAccessSource[]> {
  const { data, error } = await createAdminClient()
    .from('billing_subscriptions')
    .select(
      'status, current_period_end, grace_period_ends_at, updated_at, billing_plans!billing_subscriptions_plan_id_fkey(code)',
    )
    .eq('user_id', userId)
    .neq('status', 'incomplete')
  if (error) throw new Error('mail_access_sources_read_failed')

  const sources: MailAccessSource[] = []
  for (const row of (data ?? []) as unknown as SubscriptionRow[]) {
    const plan = Array.isArray(row.billing_plans) ? row.billing_plans[0] : row.billing_plans
    if (!planIncludesMail(plan?.code)) continue
    const entitled = ENTITLING_STATUSES.has(row.status)
    sources.push({
      kind: 'plan',
      entitled,
      endsAt: subscriptionSourceEndsAt(row.status, row.current_period_end, row.grace_period_ends_at),
      // When an immediate cancel/suspension happened, `updated_at` is the closest record of it.
      endedAt: entitled ? null : row.updated_at,
    })
  }
  return sources
}

/** Same rows as `loadMailPlanSources`, but keeping the plan code so the mailbox limit can be derived. */
export async function loadMailPlanGrants(userId: string): Promise<MailPlanGrant[]> {
  const { data, error } = await createAdminClient()
    .from('billing_subscriptions')
    .select(
      'status, current_period_end, grace_period_ends_at, updated_at, billing_plans!billing_subscriptions_plan_id_fkey(code)',
    )
    .eq('user_id', userId)
    .neq('status', 'incomplete')
  if (error) throw new Error('mail_access_sources_read_failed')

  const grants: MailPlanGrant[] = []
  for (const row of (data ?? []) as unknown as SubscriptionRow[]) {
    const plan = Array.isArray(row.billing_plans) ? row.billing_plans[0] : row.billing_plans
    if (!plan?.code || !planIncludesMail(plan.code)) continue
    const entitled = ENTITLING_STATUSES.has(row.status)
    grants.push({
      code: plan.code,
      entitled,
      endsAt: subscriptionSourceEndsAt(row.status, row.current_period_end, row.grace_period_ends_at),
      endedAt: entitled ? null : row.updated_at,
    })
  }
  return grants
}

/**
 * Source 2: standalone GLOVAL Mail add-ons (capacity 1 / 10 / 25 / 50 mailboxes each).
 *
 * PLACEHOLDER: there is no GLOVAL Mail add-on in the catalog or in
 * `user_addon_entitlements` yet, so this returns no grants. This is the ONE place
 * to wire it: return one `{ capacity, entitled, endsAt }` per grant and both the
 * access state (`loadMailAddonSources`) and the mailbox limit pick it up.
 */
export async function loadMailAddonGrants(_userId: string): Promise<MailAddonGrant[]> {
  return []
}

export async function loadMailAddonSources(userId: string): Promise<MailAccessSource[]> {
  return grantsToAccessSources({ plans: [], addons: await loadMailAddonGrants(userId) })
}

/** Both grant kinds in one read, for the page and the mailbox-creation check. */
export async function loadMailGrants(userId: string): Promise<MailGrants> {
  const [plans, addons] = await Promise.all([loadMailPlanGrants(userId), loadMailAddonGrants(userId)])
  return { plans, addons }
}

export async function loadMailAccessSources(userId: string): Promise<MailAccessSource[]> {
  const [plan, addon] = await Promise.all([loadMailPlanSources(userId), loadMailAddonSources(userId)])
  return [...plan, ...addon]
}
