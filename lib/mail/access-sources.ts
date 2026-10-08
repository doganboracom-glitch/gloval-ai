import { createAdminClient } from '@/lib/supabase/admin'
import { planIncludesMail, type MailAccessSource } from './access-state'

/**
 * Where the two mail-access sources are read from. Server only; takes a user id
 * that comes from our own tables, never from a request.
 */

const ENTITLING_STATUSES = new Set(['trialing', 'active', 'past_due'])

type SubscriptionRow = {
  status: string
  current_period_end: string | null
  trial_ends_at?: string | null
  updated_at: string | null
  billing_plans: { code: string } | { code: string }[] | null
}

/** Source 1: a main package that includes mail. `incomplete` rows never had access and are skipped. */
export async function loadMailPlanSources(userId: string): Promise<MailAccessSource[]> {
  const { data, error } = await createAdminClient()
    .from('billing_subscriptions')
    .select(
      'status, current_period_end, updated_at, billing_plans!billing_subscriptions_plan_id_fkey(code)',
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
      endsAt: row.current_period_end,
      // When an immediate cancel/suspension happened, `updated_at` is the closest record of it.
      endedAt: entitled ? null : row.updated_at,
    })
  }
  return sources
}

/**
 * Source 2: a standalone GLOVAL Mail add-on.
 *
 * PLACEHOLDER: there is no GLOVAL Mail add-on in the catalog or in
 * `user_addon_entitlements` yet, so this returns no sources. When the add-on
 * exists, return one `{ kind: 'addon', entitled, endsAt }` per active grant here
 * and nothing else needs to change.
 */
export async function loadMailAddonSources(_userId: string): Promise<MailAccessSource[]> {
  return []
}

export async function loadMailAccessSources(userId: string): Promise<MailAccessSource[]> {
  const [plan, addon] = await Promise.all([loadMailPlanSources(userId), loadMailAddonSources(userId)])
  return [...plan, ...addon]
}
