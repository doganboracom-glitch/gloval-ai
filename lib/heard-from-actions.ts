'use server'

import { createClient } from '@/lib/supabase/server'
import { getRequestUser, authUnavailableActionResult } from '@/lib/supabase/request-user'
import { isHeardFromValue } from '@/lib/heard-from'

export type SaveHeardFromResult =
  | { ok: true }
  | { ok: false; reason: 'auth_unavailable' }
  | { ok: false; error: 'not_authenticated' | 'invalid_value' | 'update_failed' }

/**
 * Saves the CURRENT user's own "How did you hear about us?" answer. Runs
 * through the regular RLS-scoped client, so only the caller's own `profiles`
 * row can be written, and only with one of the fixed values (also enforced by
 * a CHECK constraint). Skipping the question never calls this action.
 */
export async function saveHeardFrom(value: string): Promise<SaveHeardFromResult> {
  if (!isHeardFromValue(value)) return { ok: false, error: 'invalid_value' }

  const authState = await getRequestUser()
  if (authState.kind === 'unavailable') return authUnavailableActionResult()
  if (authState.kind === 'unauthenticated') return { ok: false, error: 'not_authenticated' }
  const { user } = authState

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ heard_from: value })
    .eq('id', user.id)
    .select('id')
  // RLS turns a blocked update into zero affected rows rather than an error.
  if (error || !data || data.length !== 1) return { ok: false, error: 'update_failed' }

  return { ok: true }
}
