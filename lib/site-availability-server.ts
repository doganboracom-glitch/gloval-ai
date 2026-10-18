import 'server-only'
import { classifyMissingSite, type MissingSiteKind } from '@/lib/site-availability'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Called only after `getPublishedSite` returned nothing. Reads a single boolean
 * about the slug (never the content) with the service role, because anonymous
 * visitors cannot read unpublished projects. Any failure answers "missing".
 */
export async function getMissingSiteKind(slug: string): Promise<MissingSiteKind> {
  try {
    const { data } = await createAdminClient()
      .from('projects')
      .select('published')
      .eq('slug', slug)
      .maybeSingle()
    return classifyMissingSite(data)
  } catch {
    return 'missing'
  }
}
