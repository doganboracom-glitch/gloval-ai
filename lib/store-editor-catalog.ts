import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { listOwnerCollections } from '@/lib/store-collections-actions'
import { loadEditorCatalog, type EditorCatalog } from '@/lib/store-editor-catalog-core'

export type { EditorCatalog }

/** Owner-verified active products + collections of one project, for the editor preview. */
export async function getEditorCatalog(projectId: string): Promise<EditorCatalog | null> {
  try {
    return await loadEditorCatalog(projectId, {
      authorize: authorizeProjectOwner,
      readProducts: async (id) => {
        const { data, error } = await createAdminClient()
          .from('ecommerce_products')
          .select('*')
          .eq('project_id', id)
          .eq('status', 'active')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
        if (error) throw error
        return (data as Record<string, unknown>[]) ?? []
      },
      readCollections: async (id) => (await listOwnerCollections(id)).collections,
    })
  } catch {
    return null
  }
}
