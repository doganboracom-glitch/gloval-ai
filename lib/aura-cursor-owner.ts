'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AURA_CURSOR_CODE } from '@/lib/billing-utils'
import {
  DEFAULT_CURSOR_AURA,
  clampToOwnerLimits,
  effectsSchema,
  parseOwnerCursorAuraInput,
  type CursorAuraConfig,
} from '@/lib/cursor-aura'
import { writeCursorAuraEffect } from '@/lib/cursor-aura-store'

/**
 * Site-owner actions for the paid "İmleç Bulutu" right.
 *
 * Authorization is checked here, server-side, on every call, in this order:
 *   1. a signed-in user,
 *   2. who owns the project (RLS-scoped read, plus an explicit owner check),
 *   3. who holds an ACTIVE `aura_cursor` right for that project.
 * Only then is the validated value written, through `writeCursorAuraEffect`,
 * which touches `schema_data.effects` and nothing else. Input is held to the
 * owner bounds (`OWNER_CURSOR_AURA_LIMITS`), tighter than the admin's.
 *
 * These actions are NOT behind `AURA_CURSOR_FEATURE_UI`: the flag only gates
 * selling. A right that already exists (bought or admin-granted) keeps working.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OwnerAuraError =
  | 'unauthenticated'
  | 'invalid_site'
  | 'not_entitled'
  | 'invalid_aura'
  | 'update_failed'

type Authorized = { ok: true } | { ok: false; error: OwnerAuraError }

async function authorizeOwner(projectId: string): Promise<Authorized> {
  if (typeof projectId !== 'string' || !UUID_RE.test(projectId)) return { ok: false, error: 'invalid_site' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!project) return { ok: false, error: 'invalid_site' }

  const { data: right } = await createAdminClient()
    .from('project_entitlements')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('code', AURA_CURSOR_CODE)
    .eq('status', 'active')
    .maybeSingle()
  if (!right) return { ok: false, error: 'not_entitled' }

  return { ok: true }
}

/** The owner's current aura (inside the owner bounds), or the default when none is stored. */
export async function getMyCursorAura(
  projectId: string,
): Promise<{ ok: true; config: CursorAuraConfig } | { ok: false; error: OwnerAuraError }> {
  const auth = await authorizeOwner(projectId)
  if (!auth.ok) return auth

  const { data: project } = await createAdminClient()
    .from('projects')
    .select('schema_data')
    .eq('id', projectId)
    .maybeSingle()
  const stored = effectsSchema.safeParse((project?.schema_data as { effects?: unknown } | null)?.effects)
  const aura = stored.success ? stored.data.cursorAura : undefined
  return { ok: true, config: clampToOwnerLimits(aura ?? DEFAULT_CURSOR_AURA) }
}

/**
 * Saves the owner's aura. Applies to the draft and the live published snapshot at
 * once. The owner can switch it off (`enabled: false`) but never remove the
 * stored effect, so a lapsed or revoked right cannot erase what an admin set.
 */
export async function setMyCursorAura(
  projectId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: OwnerAuraError }> {
  const auth = await authorizeOwner(projectId)
  if (!auth.ok) return auth

  const config = parseOwnerCursorAuraInput(raw)
  if (!config) return { ok: false, error: 'invalid_aura' }

  const written = await writeCursorAuraEffect(createAdminClient(), projectId, config)
  if (!written.ok) return { ok: false, error: written.error }

  revalidatePath('/dashboard', 'layout')
  if (written.slug) revalidatePath(`/site/${written.slug}`, 'layout')
  return { ok: true }
}
