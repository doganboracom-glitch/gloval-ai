import { keepsVersionHistory } from '@/lib/project-backups-core'

export type NoticePlan = 'FREE' | 'STARTER'

export type VersionRow = { id: string; project_id: string; label: string | null }
export type ProjectRow = { id: string; owner_id: string; published_version_id: string | null }

export const NOTICE_TYPE = 'version_prune_notice'

export function noticeDedupeKey(userId: string): string {
  return `${NOTICE_TYPE}:v1:${userId}`
}

/** Active subscription codes -> the plan the notice is written for, or null when history is kept. */
export function noticePlanFor(activeCodes: Array<string | null | undefined>): NoticePlan | null {
  if (activeCodes.some((code) => keepsVersionHistory(code))) return null
  return activeCodes.some((code) => code?.trim().toLowerCase() === 'starter') ? 'STARTER' : 'FREE'
}

/** Owners that have at least one stale, non-published version and no plan that keeps history. */
export function affectedOwners(
  staleVersions: VersionRow[],
  projects: ProjectRow[],
  codesByOwner: Map<string, Array<string | null | undefined>>,
): Map<string, { plan: NoticePlan; versions: number }> {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const result = new Map<string, { plan: NoticePlan; versions: number }>()
  for (const version of staleVersions) {
    const project = projectById.get(version.project_id)
    if (!project) continue
    if (version.label === 'published' || version.id === project.published_version_id) continue
    const plan = noticePlanFor(codesByOwner.get(project.owner_id) ?? [])
    if (!plan) continue
    const entry = result.get(project.owner_id) ?? { plan, versions: 0 }
    entry.versions += 1
    result.set(project.owner_id, entry)
  }
  return result
}

export function countByPlan(owners: Map<string, { plan: NoticePlan }>): Record<NoticePlan, number> {
  const counts: Record<NoticePlan, number> = { FREE: 0, STARTER: 0 }
  for (const { plan } of owners.values()) counts[plan] += 1
  return counts
}

/** Fixed-interval pacing: resolves immediately for the first call, then spaces calls by `intervalMs`. */
export function createPacer(intervalMs: number, now: () => number, sleep: (ms: number) => Promise<void>) {
  let next = 0
  return async () => {
    const wait = next - now()
    if (wait > 0) await sleep(wait)
    next = Math.max(now(), next) + intervalMs
  }
}
