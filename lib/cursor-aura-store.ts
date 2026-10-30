import { createAdminClient } from '@/lib/supabase/admin'
import type { CursorAuraConfig } from '@/lib/cursor-aura'

/**
 * The ONLY code that writes `schema_data.effects`. Deliberately not a
 * `'use server'` module: callers (the admin action and the owner action) do the
 * authorization themselves and pass an already validated config.
 *
 * The value goes to the draft AND to the live published snapshot so a change is
 * visible on the published site at once, without a republish. `null` removes it.
 */

type AdminClient = ReturnType<typeof createAdminClient>

export type WriteAuraResult =
  | { ok: true; slug: string | null }
  | { ok: false; error: 'invalid_site' | 'update_failed' }

export async function writeCursorAuraEffect(
  admin: AdminClient,
  projectId: string,
  config: CursorAuraConfig | null,
  source: 'owner' | 'admin' = 'admin',
): Promise<WriteAuraResult> {
  const { data: project } = await admin
    .from('projects')
    .select('id, slug, published_version_id, schema_data')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return { ok: false, error: 'invalid_site' }

  const withEffects = (schema: unknown) => {
    const { effects: _previous, ...rest } = (schema && typeof schema === 'object' ? schema : {}) as Record<string, unknown>
    const stored = config && source === 'owner' ? { ...config, source } : config
    return stored ? { ...rest, effects: { cursorAura: stored } } : rest
  }

  const { error } = await admin
    .from('projects')
    .update({ schema_data: withEffects(project.schema_data) })
    .eq('id', projectId)
  if (error) return { ok: false, error: 'update_failed' }

  if (project.published_version_id) {
    const { data: version } = await admin
      .from('project_versions')
      .select('schema_data')
      .eq('id', project.published_version_id)
      .maybeSingle()
    if (version) {
      const { error: versionError } = await admin
        .from('project_versions')
        .update({ schema_data: withEffects(version.schema_data) })
        .eq('id', project.published_version_id)
      if (versionError) return { ok: false, error: 'update_failed' }
    }
  }

  return { ok: true, slug: (project.slug as string | null) ?? null }
}
