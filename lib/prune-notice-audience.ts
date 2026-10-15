import { createAdminClient } from '@/lib/supabase/admin'
import { VERSION_PRUNE_DAYS } from '@/lib/project-backups-core'
import {
  affectedOwners,
  type NoticePlan,
  type ProjectRow,
  type VersionRow,
} from '@/lib/prune-notice-audience-core'

const PAGE = 1000
const ACTIVE_STATUSES = ['trialing', 'active', 'past_due', 'suspended']

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Read-only. Loads who would be hit by the 30-day version prune. Never writes. */
export async function loadPruneAudience(now = new Date()): Promise<Map<string, { plan: NoticePlan; versions: number }>> {
  const admin = createAdminClient()
  const cutoff = new Date(now.getTime() - VERSION_PRUNE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const versions: VersionRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('project_versions')
      .select('id, project_id, label')
      .lt('created_at', cutoff)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    versions.push(...((data ?? []) as VersionRow[]))
    if (!data || data.length < PAGE) break
  }

  const projects: ProjectRow[] = []
  for (const ids of chunk([...new Set(versions.map((v) => v.project_id))], 200)) {
    const { data, error } = await admin.from('projects').select('id, owner_id, published_version_id').in('id', ids)
    if (error) throw error
    projects.push(...((data ?? []) as ProjectRow[]))
  }

  const codesByOwner = new Map<string, Array<string | null>>()
  for (const ids of chunk([...new Set(projects.map((p) => p.owner_id))], 200)) {
    const { data, error } = await admin
      .from('billing_subscriptions')
      .select('user_id, billing_plans!billing_subscriptions_plan_id_fkey(code)')
      .in('user_id', ids)
      .in('status', ACTIVE_STATUSES)
    if (error) throw error
    for (const sub of (data ?? []) as unknown as Array<{
      user_id: string
      billing_plans: { code: string | null } | Array<{ code: string | null }> | null
    }>) {
      const plan = Array.isArray(sub.billing_plans) ? sub.billing_plans[0] : sub.billing_plans
      codesByOwner.set(sub.user_id, [...(codesByOwner.get(sub.user_id) ?? []), plan?.code ?? null])
    }
  }

  return affectedOwners(versions, projects, codesByOwner)
}
