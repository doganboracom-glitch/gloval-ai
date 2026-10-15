import { createHash } from 'node:crypto'
import { backupCadence, canUseVersionHistory, exactPlanCode, type BackupCadence } from '@/lib/pricing-config'

/**
 * Pure rules for project draft backups (no I/O). What is backed up is ONLY the
 * draft `projects.schema_data`; the product catalog, orders, customers, payment
 * settings and contact messages are never part of a backup.
 */
export type BackupKind = 'daily' | 'weekly' | 'pre_restore'

/** A backup row as shown to the owner (never carries the schema itself). */
export type BackupItem = {
  id: string
  kind: BackupKind
  created_at: string
}

/** How many backups of each kind are kept per project (pre_restore is its own pool). */
export const BACKUP_RETENTION: Record<BackupKind, number> = {
  daily: 14,
  weekly: 4,
  pre_restore: 5,
}

/** Safety net only; the count-based retention above is what normally trims rows. */
export const BACKUP_EXPIRY_DAYS = 90
export const BACKUP_SCHEMA_VERSION = 1
export const WEEKLY_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Non-published version rows older than this are pruned. */
export const VERSION_PRUNE_DAYS = 30

export const BACKUP_RESTORE_LIMIT = 5
export const BACKUP_RESTORE_WINDOW_MS = 10 * 60 * 1000

/** Deterministic JSON: object keys sorted so equal content always hashes equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function contentHash(schema: unknown): string {
  return createHash('sha256').update(canonicalJson(schema)).digest('hex')
}

export function payloadBytes(schema: unknown): number {
  return Buffer.byteLength(JSON.stringify(schema), 'utf8')
}

export function utcDayKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10)
}

export function expiresAt(from: Date): string {
  return new Date(from.getTime() + BACKUP_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Is a new backup of `kind` due, given the project's latest backup of that kind?
 * daily: none yet today (UTC). weekly: the latest one is 7+ days old.
 */
export function isBackupDue(kind: 'daily' | 'weekly', latestAt: string | null, now: Date): boolean {
  if (!latestAt) return true
  if (kind === 'daily') return utcDayKey(latestAt) !== utcDayKey(now)
  return now.getTime() - new Date(latestAt).getTime() >= WEEKLY_MIN_AGE_MS
}

/** The sweep only revisits projects saved after their latest backup (or never backed up). */
export function changedSinceBackup(projectUpdatedAt: string, latestAt: string | null): boolean {
  if (!latestAt) return true
  return new Date(projectUpdatedAt).getTime() > new Date(latestAt).getTime()
}

/** Version pruning deletes rows, so it only runs when the flag is exactly the string 'true'. */
export function isPruneEnabled(flag: string | undefined | null): boolean {
  return flag === 'true'
}

/** Cadence for a raw `billing_plans.code`; unknown codes (add-ons, typos) never get backups. */
export function cadenceForBillingCode(code: string | null | undefined): BackupCadence {
  const plan = exactPlanCode(code)
  return plan ? backupCadence(plan) : null
}

/** Whether a raw `billing_plans.code` keeps its version history (exact list, no substring matching). */
export function keepsVersionHistory(code: string | null | undefined): boolean {
  const plan = exactPlanCode(code)
  return plan ? canUseVersionHistory(plan) : false
}

export type PruneVersionRow = { id: string; project_id: string; label: string | null }
export type PruneProjectRow = { id: string; owner_id: string; published_version_id: string | null }

/**
 * Picks the version rows that may be pruned: never a published version (by label or
 * by `published_version_id`), never one of a project that is missing, and never one
 * whose owner has an active plan that keeps version history.
 */
export function selectPrunableVersionIds(
  versions: PruneVersionRow[],
  projects: PruneProjectRow[],
  protectedOwnerIds: ReadonlySet<string>,
): string[] {
  const byId = new Map(projects.map((project) => [project.id, project]))
  const ids: string[] = []
  for (const version of versions) {
    if (version.label === 'published') continue
    const project = byId.get(version.project_id)
    if (!project) continue
    if (project.published_version_id === version.id) continue
    if (protectedOwnerIds.has(project.owner_id)) continue
    ids.push(version.id)
  }
  return ids
}

/** Ids past the retention count; `rowsNewestFirst` must already be sorted newest first. */
export function excessBackupIds(rowsNewestFirst: Array<{ id: string }>, keep: number): string[] {
  return rowsNewestFirst.slice(Math.max(keep, 0)).map((row) => row.id)
}
