export const COLLECTION_SYNC_WARNING =
  'Ürün kaydedildi ancak koleksiyon seçimi güncellenemedi. Koleksiyonlar panelinden tekrar deneyin.'

type SyncResult = { ok: boolean }

/**
 * Runs the separate "which collections is this product in" step after a
 * product has already been saved. It never throws and never blocks the save:
 * a failed or unavailable step only yields a warning for the owner.
 */
export async function syncProductCollectionsAfterSave(args: {
  hasCollections: boolean
  changed: boolean
  sync: () => Promise<SyncResult>
}): Promise<{ attempted: boolean; warning: string | null }> {
  if (!args.hasCollections || !args.changed) return { attempted: false, warning: null }
  try {
    const result = await args.sync()
    return { attempted: true, warning: result.ok ? null : COLLECTION_SYNC_WARNING }
  } catch {
    return { attempted: true, warning: COLLECTION_SYNC_WARNING }
  }
}
