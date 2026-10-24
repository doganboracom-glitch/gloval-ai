import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type DraftPayload,
  draftExpiry,
  hashClaimToken,
  newClaimToken,
  normalizeDraftEmail,
} from '@/lib/signup-draft-core'

type Admin = Pick<SupabaseClient, 'from'>

export type ClaimResult =
  | { status: 'claimed'; id: string; payload: DraftPayload }
  | { status: 'done'; projectId: string; publishIntent: boolean }
  | { status: 'busy' }
  | { status: 'invalid' }

/** Stores a draft bound to the sign-up e-mail and returns the one-time claim token. */
export async function createDraft(
  admin: Admin,
  input: { email: string; payload: DraftPayload; now?: number },
): Promise<string> {
  const now = input.now ?? Date.now()
  const token = newClaimToken()
  const { error } = await admin.from('signup_drafts').insert({
    token_hash: hashClaimToken(token),
    email: normalizeDraftEmail(input.email),
    payload: input.payload,
    expires_at: draftExpiry(now),
  })
  if (error) throw error
  return token
}

/**
 * One-time, owner-bound claim. The atomic UPDATE only matches an unconsumed,
 * unexpired draft whose e-mail equals the signed-in user's verified e-mail, so a
 * different account (or a replay) can never read the payload. A second call by
 * the SAME user only learns the outcome of their own earlier claim.
 */
export async function claimDraft(
  admin: Admin,
  input: { token: string; userId: string; email: string; now?: number },
): Promise<ClaimResult> {
  const now = input.now ?? Date.now()
  const hash = hashClaimToken(input.token)

  const { data: claimed } = await admin
    .from('signup_drafts')
    .update({ consumed_at: new Date(now).toISOString(), claimed_by: input.userId })
    .eq('token_hash', hash)
    .eq('email', normalizeDraftEmail(input.email))
    .is('consumed_at', null)
    .gt('expires_at', new Date(now).toISOString())
    .select('id, payload')
    .maybeSingle()
  if (claimed) return { status: 'claimed', id: claimed.id as string, payload: claimed.payload as DraftPayload }

  const { data: own } = await admin
    .from('signup_drafts')
    .select('project_id, payload')
    .eq('token_hash', hash)
    .eq('claimed_by', input.userId)
    .maybeSingle()
  if (!own) return { status: 'invalid' }
  if (own.project_id) {
    return {
      status: 'done',
      projectId: own.project_id as string,
      publishIntent: (own.payload as DraftPayload | null)?.publishIntent === true,
    }
  }
  return { status: 'busy' }
}

export async function completeDraft(admin: Admin, id: string, projectId: string): Promise<void> {
  await admin.from('signup_drafts').update({ project_id: projectId }).eq('id', id)
}

/** Reopens a claimed draft after a failed project insert so the user can retry. */
export async function releaseDraft(admin: Admin, id: string): Promise<void> {
  await admin.from('signup_drafts').update({ consumed_at: null, claimed_by: null }).eq('id', id)
}
