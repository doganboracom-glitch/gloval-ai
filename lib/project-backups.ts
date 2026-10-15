import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { websiteSchema, type WebsiteSchema } from '@/lib/website-schema'
import {
  BACKUP_RETENTION,
  BACKUP_SCHEMA_VERSION,
  VERSION_PRUNE_DAYS,
  cadenceForBillingCode,
  changedSinceBackup,
  contentHash,
  excessBackupIds,
  expiresAt,
  isBackupDue,
  isPruneEnabled,
  keepsVersionHistory,
  payloadBytes,
  selectPrunableVersionIds,
  type BackupKind,
  type PruneProjectRow,
  type PruneVersionRow,
} from '@/lib/project-backups-core'

const TABLE = 'project_backups'
const ACTIVE_STATUSES = ['trialing', 'active', 'past_due', 'suspended']
const OWNER_PAGE = 100

export type RecordResult = 'created' | 'unchanged' | 'duplicate'

async function latestOfKind(projectId: string, kind: BackupKind) {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select('content_hash, created_at')
    .eq('project_id', projectId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as { content_hash: string; created_at: string } | null
}

async function trimRetention(projectId: string, kind: BackupKind): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(TABLE)
    .select('id')
    .eq('project_id', projectId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
  if (error) throw error
  const excess = excessBackupIds((data ?? []) as Array<{ id: string }>, BACKUP_RETENTION[kind])
  if (excess.length === 0) return
  const { error: delErr } = await admin.from(TABLE).delete().in('id', excess)
  if (delErr) throw delErr
}

/**
 * Writes one backup. daily/weekly are skipped when the content hash equals the
 * latest backup of that kind, and a second write on the same UTC day hits the
 * unique index (23505) and is reported as `duplicate`. pre_restore always writes.
 */
export async function recordBackup(input: {
  projectId: string
  kind: BackupKind
  schema: WebsiteSchema
  latestHash?: string | null
}): Promise<RecordResult> {
  const hash = contentHash(input.schema)
  if (input.kind !== 'pre_restore') {
    const knownHash =
      input.latestHash !== undefined ? input.latestHash : (await latestOfKind(input.projectId, input.kind))?.content_hash
    if (knownHash === hash) return 'unchanged'
  }

  const { error } = await createAdminClient()
    .from(TABLE)
    .insert({
      project_id: input.projectId,
      kind: input.kind,
      schema_data: input.schema,
      schema_version: BACKUP_SCHEMA_VERSION,
      content_hash: hash,
      bytes: payloadBytes(input.schema),
      expires_at: expiresAt(new Date()),
    })
  if (error) {
    if ((error as { code?: string }).code === '23505') return 'duplicate'
    throw error
  }
  await trimRetention(input.projectId, input.kind)
  return 'created'
}

/** Opportunistic backup (publish / manual save): writes only when the plan's cadence says one is due. */
export async function backupIfDue(input: {
  projectId: string
  planCode: string | null
  schema: WebsiteSchema
  now?: Date
}): Promise<RecordResult | 'skipped'> {
  const kind = cadenceForBillingCode(input.planCode)
  if (!kind) return 'skipped'
  const latest = await latestOfKind(input.projectId, kind)
  if (!isBackupDue(kind, latest?.created_at ?? null, input.now ?? new Date())) return 'skipped'
  return recordBackup({ projectId: input.projectId, kind, schema: input.schema, latestHash: latest?.content_hash ?? null })
}

export type BackupSweepSummary = {
  expiredDeleted: number
  pruneEnabled: boolean
  /** Dry-run count: version rows the prune step would delete (null when the count failed). */
  versionsWouldPrune: number | null
  /** Rows actually deleted; always 0 while BACKUP_PRUNE_ENABLED is off. */
  versionsPruned: number
  scanned: number
  created: number
  unchanged: number
  stoppedByBudget: boolean
}

type SubscriptionRow = {
  id: string
  user_id: string
  billing_plans: { code: string | null } | Array<{ code: string | null }> | null
}

const PRUNE_BATCH = 2000

/**
 * Read-only: ids of non-published version rows older than the cutoff whose owner
 * has no active plan that keeps version history (exact plan-code list).
 */
export async function findPrunableVersionIds(cutoffIso: string, limit = PRUNE_BATCH): Promise<string[]> {
  const admin = createAdminClient()
  const { data: versions, error } = await admin
    .from('project_versions')
    .select('id, project_id, label')
    .lt('created_at', cutoffIso)
    .or('label.is.null,label.neq.published')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  const versionRows = (versions ?? []) as PruneVersionRow[]
  if (versionRows.length === 0) return []

  const projectIds = [...new Set(versionRows.map((row) => row.project_id))]
  const { data: projects, error: projectErr } = await admin
    .from('projects')
    .select('id, owner_id, published_version_id')
    .in('id', projectIds)
  if (projectErr) throw projectErr
  const projectRows = (projects ?? []) as PruneProjectRow[]

  const ownerIds = [...new Set(projectRows.map((row) => row.owner_id))]
  const protectedOwners = new Set<string>()
  if (ownerIds.length > 0) {
    const { data: subs, error: subErr } = await admin
      .from('billing_subscriptions')
      .select('user_id, billing_plans!billing_subscriptions_plan_id_fkey(code)')
      .in('user_id', ownerIds)
      .in('status', ACTIVE_STATUSES)
    if (subErr) throw subErr
    for (const sub of (subs ?? []) as unknown as Array<{
      user_id: string
      billing_plans: { code: string | null } | Array<{ code: string | null }> | null
    }>) {
      const plan = Array.isArray(sub.billing_plans) ? sub.billing_plans[0] : sub.billing_plans
      if (keepsVersionHistory(plan?.code)) protectedOwners.add(sub.user_id)
    }
  }
  return selectPrunableVersionIds(versionRows, projectRows, protectedOwners)
}

/**
 * Deletes expired backups. Stale version rows are only COUNTED (dry run) unless
 * BACKUP_PRUNE_ENABLED is exactly 'true'; with the flag off no version row is deleted.
 */
async function sweepExpired(
  now: Date,
): Promise<Pick<BackupSweepSummary, 'expiredDeleted' | 'pruneEnabled' | 'versionsWouldPrune' | 'versionsPruned'>> {
  const admin = createAdminClient()
  const { data, error } = await admin.from(TABLE).delete().lt('expires_at', now.toISOString()).select('id')
  if (error) throw error
  const expiredDeleted = data?.length ?? 0

  const pruneEnabled = isPruneEnabled(process.env.BACKUP_PRUNE_ENABLED)
  let versionsWouldPrune: number | null = null
  let versionsPruned = 0
  try {
    const cutoff = new Date(now.getTime() - VERSION_PRUNE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const ids = await findPrunableVersionIds(cutoff)
    versionsWouldPrune = ids.length
    if (pruneEnabled) {
      if (ids.length > 0) {
        const { data: deleted, error: delErr } = await admin.from('project_versions').delete().in('id', ids).select('id')
        if (delErr) throw delErr
        versionsPruned = deleted?.length ?? 0
      }
    } else {
      console.log(`[project-backups] version prune dry-run (BACKUP_PRUNE_ENABLED off): ${ids.length} would be deleted, 0 deleted`)
    }
  } catch (err) {
    console.log('[project-backups] version prune step failed:', err instanceof Error ? err.message : 'unknown')
  }
  return { expiredDeleted, pruneEnabled, versionsWouldPrune, versionsPruned }
}

/**
 * Cron entry: backs up eligible projects that have no backup for today (daily)
 * or whose last backup is 7+ days old (weekly), only if they were saved since.
 * Stops at the deadline; the next run continues because finished projects are
 * no longer due.
 */
export async function runBackupSweep(options: { deadlineMs: number; now?: Date }): Promise<BackupSweepSummary> {
  const now = options.now ?? new Date()
  const admin = createAdminClient()
  const summary: BackupSweepSummary = {
    ...(await sweepExpired(now)),
    scanned: 0,
    created: 0,
    unchanged: 0,
    stoppedByBudget: false,
  }

  let afterId: string | null = null
  while (true) {
    if (Date.now() >= options.deadlineMs) {
      summary.stoppedByBudget = true
      break
    }
    let query = admin
      .from('billing_subscriptions')
      .select('id, user_id, billing_plans!billing_subscriptions_plan_id_fkey(code)')
      .in('status', ACTIVE_STATUSES)
      .order('id', { ascending: true })
      .limit(OWNER_PAGE)
    if (afterId) query = query.gt('id', afterId)
    const { data, error } = await query
    if (error) throw error
    const subs = (data ?? []) as unknown as SubscriptionRow[]
    if (subs.length === 0) break
    afterId = subs[subs.length - 1].id

    const kindByOwner = new Map<string, 'daily' | 'weekly'>()
    for (const sub of subs) {
      const plan = Array.isArray(sub.billing_plans) ? sub.billing_plans[0] : sub.billing_plans
      const kind = cadenceForBillingCode(plan?.code)
      if (kind) kindByOwner.set(sub.user_id, kind)
    }

    if (kindByOwner.size > 0) {
      const done = await backupOwnersBatch(kindByOwner, now, options.deadlineMs, summary)
      if (!done) {
        summary.stoppedByBudget = true
        break
      }
    }
    if (subs.length < OWNER_PAGE) break
  }
  return summary
}

/** Returns false when the deadline cut the batch short. */
async function backupOwnersBatch(
  kindByOwner: Map<string, 'daily' | 'weekly'>,
  now: Date,
  deadlineMs: number,
  summary: BackupSweepSummary,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data: projects, error } = await admin
    .from('projects')
    .select('id, owner_id, updated_at')
    .in('owner_id', [...kindByOwner.keys()])
  if (error) throw error
  const rows = (projects ?? []) as Array<{ id: string; owner_id: string; updated_at: string }>
  if (rows.length === 0) return true

  const latestByProject = new Map<string, { content_hash: string; created_at: string }>()
  const { data: backups, error: backupErr } = await admin
    .from(TABLE)
    .select('project_id, kind, content_hash, created_at')
    .in('project_id', rows.map((row) => row.id))
    .in('kind', ['daily', 'weekly'])
    .order('created_at', { ascending: false })
  if (backupErr) throw backupErr
  const seen = new Set<string>()
  for (const backup of (backups ?? []) as Array<{ project_id: string; kind: string; content_hash: string; created_at: string }>) {
    const key = `${backup.project_id}:${backup.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    latestByProject.set(key, backup)
  }

  for (const project of rows) {
    if (Date.now() >= deadlineMs) return false
    const kind = kindByOwner.get(project.owner_id)
    if (!kind) continue
    const latest = latestByProject.get(`${project.id}:${kind}`) ?? null
    if (!isBackupDue(kind, latest?.created_at ?? null, now)) continue
    if (!changedSinceBackup(project.updated_at, latest?.created_at ?? null)) continue

    summary.scanned += 1
    try {
      const { data: row, error: loadErr } = await admin
        .from('projects')
        .select('schema_data')
        .eq('id', project.id)
        .maybeSingle()
      if (loadErr || !row) continue
      const parsed = websiteSchema.safeParse(row.schema_data)
      if (!parsed.success) continue
      const result = await recordBackup({
        projectId: project.id,
        kind,
        schema: parsed.data,
        latestHash: latest?.content_hash ?? null,
      })
      if (result === 'created') summary.created += 1
      else summary.unchanged += 1
    } catch (err) {
      console.log('[project-backups] backup failed for one project:', err instanceof Error ? err.message : 'unknown')
    }
  }
  return true
}

/** Loads a backup's schema, scoped to its project. Returns null when missing or unparsable. */
export async function loadBackupSchema(projectId: string, backupId: string): Promise<WebsiteSchema | null> {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select('schema_data')
    .eq('id', backupId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const parsed = websiteSchema.safeParse(data.schema_data)
  return parsed.success ? parsed.data : null
}
