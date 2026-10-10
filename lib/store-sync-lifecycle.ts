export type ExistingCatalogRow = {
  id: string
  slug: string
  status?: string | null
  source?: string | null
  sync_archived_at?: string | null
}

/**
 * Decides which already-synced products leave or re-enter the catalog after the
 * site schema changed. Only rows the sync itself created (`source = 'sync'`)
 * are ever touched; owner-added products are never archived. A product comes
 * back only if SYNC archived it (`sync_archived_at`), so an owner's manual
 * archive is respected on republish.
 */
export function planSyncLifecycle(
  existing: ExistingCatalogRow[],
  schemaSlugs: ReadonlySet<string>,
): { archiveIds: string[]; reactivateIds: string[] } {
  const archiveIds: string[] = []
  const reactivateIds: string[] = []
  for (const row of existing) {
    if (row.source !== 'sync') continue
    const inSchema = schemaSlugs.has(row.slug)
    if (!inSchema && row.status === 'active') archiveIds.push(row.id)
    if (inSchema && row.status === 'archived' && row.sync_archived_at) reactivateIds.push(row.id)
  }
  return { archiveIds, reactivateIds }
}
