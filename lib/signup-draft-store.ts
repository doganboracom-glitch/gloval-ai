import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CONSUMED_DRAFT_GRACE_MS,
  DRAFT_IP_WINDOW_MS,
  type DraftPayload,
  MAX_ACTIVE_DRAFTS_PER_EMAIL,
  MAX_DRAFTS_PER_IP_PER_HOUR,
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

export type DraftLimit = 'ip' | 'email'

/**
 * Counts what already exists BEFORE a new draft is inserted: at most 3 active
 * (unconsumed, unexpired) drafts per e-mail and 10 drafts per IP per hour. A
 * missing table surfaces as a thrown error so the caller can log and warn.
 * The IP limit is skipped when the IP is unknown rather than pooling strangers.
 */
export async function checkDraftLimits(
  admin: Admin,
  input: { email: string; ipHash: string | null; now?: number },
): Promise<DraftLimit | null> {
  const now = input.now ?? Date.now()
  const email = normalizeDraftEmail(input.email)

  const active = await admin
    .from('signup_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .is('consumed_at', null)
    .gt('expires_at', new Date(now).toISOString())
  if (active.error) throw active.error
  if ((active.count ?? 0) >= MAX_ACTIVE_DRAFTS_PER_EMAIL) return 'email'

  if (input.ipHash) {
    const recent = await admin
      .from('signup_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', input.ipHash)
      .gt('created_at', new Date(now - DRAFT_IP_WINDOW_MS).toISOString())
    if (recent.error) throw recent.error
    if ((recent.count ?? 0) >= MAX_DRAFTS_PER_IP_PER_HOUR) return 'ip'
  }
  return null
}

/** Deletes expired drafts and drafts consumed more than a day ago; returns the count. */
export async function sweepSignupDrafts(admin: Admin, nowMs: number): Promise<number> {
  const { data, error } = await admin
    .from('signup_drafts')
    .delete()
    .or(
      `expires_at.lt.${new Date(nowMs).toISOString()},consumed_at.lt.${new Date(nowMs - CONSUMED_DRAFT_GRACE_MS).toISOString()}`,
    )
    .select('id')
  if (error) throw error
  const deleted = data?.length ?? 0
  console.log(`[signup-drafts] cleanup deleted ${deleted} expired/consumed draft(s)`)
  return deleted
}

/** Stores a draft bound to the sign-up e-mail and returns the one-time claim token. */
export async function createDraft(
  admin: Admin,
  input: { email: string; payload: DraftPayload; ipHash?: string | null; now?: number },
): Promise<string> {
  const now = input.now ?? Date.now()
  const token = newClaimToken()
  const { error } = await admin.from('signup_drafts').insert({
    token_hash: hashClaimToken(token),
    email: normalizeDraftEmail(input.email),
    payload: input.payload,
    expires_at: draftExpiry(now),
    ip_hash: input.ipHash ?? null,
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
