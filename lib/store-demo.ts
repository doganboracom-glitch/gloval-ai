import type { createAdminClient } from '@/lib/supabase/admin'
import { parseDemoStoreIds } from '@/lib/store-payment-policy'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Resolves, on the SERVER, whether `projectId` is a demo store. Sources, both
 * writable only by the platform operator:
 *  - `DEMO_STORE_PROJECT_IDS` env var (comma separated project ids), and
 *  - the `demo_stores` table (RLS on, no policies: service role only).
 *
 * Fails closed: a missing table or any query error means "not a demo store",
 * so the mock card can never be enabled by accident. Returns the set to pass
 * to `isDemoStore` from `lib/store-payment-policy.ts`.
 */
export async function loadDemoStoreIds(
  admin: Admin,
  projectId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<Set<string>> {
  const ids = new Set(parseDemoStoreIds(env.DEMO_STORE_PROJECT_IDS))
  if (ids.has(projectId.toLowerCase())) return new Set([projectId])

  try {
    const { data, error } = await admin
      .from('demo_stores')
      .select('project_id')
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) {
      // 42P01 / PGRST205: table not created yet (scripts/034 not applied).
      if (error.code !== '42P01' && error.code !== 'PGRST205') {
        console.error('[store-demo] lookup failed', { projectId, code: error.code })
      }
      return new Set()
    }
    return data?.project_id ? new Set([String(data.project_id)]) : new Set()
  } catch {
    return new Set()
  }
}
