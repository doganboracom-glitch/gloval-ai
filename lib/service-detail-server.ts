import 'server-only'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { websiteSchema } from '@/lib/website-schema'
import { generateServiceDetail } from '@/lib/service-detail-ai'
import {
  runServiceDetailBackground,
  type ServiceBackgroundDeps,
  type ServiceBackgroundResult,
} from '@/lib/service-detail-background'

/** Whole-run budget; a slow model must never hold the worker up. */
const SERVICE_DETAIL_BUDGET_MS = 120_000

const inflight = new Set<string>()

function realDeps(projectId: string, ownerId: string): ServiceBackgroundDeps {
  const admin = createAdminClient()
  return {
    async load() {
      const { data, error } = await admin
        .from('projects')
        .select('schema_data, updated_at')
        .eq('id', projectId)
        .eq('owner_id', ownerId)
        .maybeSingle()
      if (error || !data) return null
      const parsed = websiteSchema.safeParse(data.schema_data)
      return parsed.success ? { site: parsed.data, version: data.updated_at as string } : null
    },
    async save(site, version) {
      const { data, error } = await admin
        .from('projects')
        .update({ schema_data: site, updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .eq('owner_id', ownerId)
        .eq('updated_at', version)
        .select('id')
      return !error && (data?.length ?? 0) === 1
    },
    // Background text always uses the standard model tier and is never charged to the owner.
    write: (site, itemIndex) => generateServiceDetail(site, itemIndex, null, { standard: true }),
    async sitesLast24h() {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count, error } = await admin
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .gte('created_at', since)
      if (error) throw error
      return count ?? 0
    },
  }
}

export async function runServiceDetailNow(args: {
  projectId: string
  ownerId: string
  deps?: ServiceBackgroundDeps
}): Promise<ServiceBackgroundResult> {
  if (inflight.has(args.projectId)) return { status: 'skipped', reason: 'nothing_to_do' }
  inflight.add(args.projectId)
  try {
    const run = runServiceDetailBackground(args.deps ?? realDeps(args.projectId, args.ownerId))
    const timeout = new Promise<ServiceBackgroundResult>((resolve) =>
      setTimeout(() => resolve({ status: 'failed', reason: 'unexpected' }), SERVICE_DETAIL_BUDGET_MS),
    )
    return await Promise.race([run, timeout])
  } finally {
    inflight.delete(args.projectId)
  }
}

/**
 * Runs after the response is sent, so site creation never waits on the model
 * and never fails because of it. Sites without a services section are a no-op.
 */
export function scheduleServiceDetails(args: { projectId: string; ownerId: string }): void {
  try {
    after(async () => {
      const result = await runServiceDetailNow(args)
      console.log('[service-detail] background', result.status, 'reason' in result ? result.reason : '')
    })
  } catch {
    console.log('[service-detail] failed schedule')
  }
}
