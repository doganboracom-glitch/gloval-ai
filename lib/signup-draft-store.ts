import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DRAFT_EMAIL_ACTIVE_LIMIT,
  DRAFT_GLOBAL_ACTIVE_LIMIT,
  DRAFT_IP_LIMIT,
  DRAFT_IP_WINDOW_SECONDS,
  type DraftFailure,
  type DraftPayload,
  draftExpiry,
  hashClaimToken,
  newClaimToken,
  normalizeDraftEmail,
} from '@/lib/signup-draft-core'

type Admin = Pick<SupabaseClient, 'from' | 'rpc'>

export type ClaimResult =
  | { status: 'claimed'; id: string; payload: DraftPayload }
  | { status: 'done'; projectId: string; publishIntent: boolean; editIntent: boolean }
  | { status: 'busy' }
  | { status: 'invalid' }

/** Carries only a machine-readable reason and the Postgres code: never row data. */
export class DraftStoreError extends Error {
  constructor(
    readonly reason: DraftFailure,
    readonly code?: string,
    detail?: string,
  ) {
    super(detail ?? reason)
  }
}

function storageError(error: { code?: string; message?: string }): DraftStoreError {
  // 42P01 = undefined_table, PGRST205 = table not in the PostgREST schema cache.
  const missing = error.code === '42P01' || error.code === 'PGRST205'
  return new DraftStoreError(missing ? 'table_missing' : 'storage', error.code, error.message)
}

async function countActive(admin: Admin, nowMs: number, email?: string): Promise<number> {
  let query = admin
    .from('signup_drafts')
    .select('id', { count: 'exact', head: true })
    .is('consumed_at', null)
    .gt('expires_at', new Date(nowMs).toISOString())
  if (email) query = query.eq('email', email)
  const { count, error } = await query
  if (error) throw storageError(error)
  return count ?? 0
}

/**
 * Durable per-IP budget (shared `reserve_rate_limit` counters, keyed by an HMAC of
 * the IP: no raw IP is stored). Fails closed: an unreachable counter means no draft.
 */
export async function reserveDraftIpSlot(admin: Admin, ipHash: string): Promise<boolean> {
  const { data, error } = await admin
    .rpc('reserve_rate_limit', {
      p_subject: `sdraft:hr:ip:${ipHash}`,
      p_limit: DRAFT_IP_LIMIT,
      p_window_seconds: DRAFT_IP_WINDOW_SECONDS,
    })
    .maybeSingle()
  if (error || !data) return false
  return (data as { allowed: boolean }).allowed === true
}

/**
 * Stores a draft bound to the sign-up e-mail and returns the one-time claim token.
 * Throws DraftStoreError when the e-mail already holds too many active drafts, the
 * table is at capacity, or storage fails.
 */
export async function createDraft(
  admin: Admin,
  input: { email: string; payload: DraftPayload; now?: number },
): Promise<string> {
  const now = input.now ?? Date.now()
  const email = normalizeDraftEmail(input.email)

  if ((await countActive(admin, now, email)) >= DRAFT_EMAIL_ACTIVE_LIMIT) {
    throw new DraftStoreError('email_limit')
  }
  if ((await countActive(admin, now)) >= DRAFT_GLOBAL_ACTIVE_LIMIT) {
    throw new DraftStoreError('capacity')
  }

  const token = newClaimToken()
  const { error } = await admin.from('signup_drafts').insert({
    token_hash: hashClaimToken(token),
    email,
    payload: input.payload,
    expires_at: draftExpiry(now),
  })
  if (error) throw storageError(error)
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
      editIntent: (own.payload as DraftPayload | null)?.editIntent === true,
    }
  }
  return { status: 'busy' }
}

/**
 * Marks the draft as turned into a project and scrubs it: the e-mail and the site
 * content are no longer needed, only the project id and the publish intent remain
 * (so a second tab still resolves) until the cron removes the row.
 */
export async function completeDraft(
  admin: Admin,
  id: string,
  projectId: string,
  publishIntent: boolean,
  editIntent = false,
): Promise<void> {
  await admin
    .from('signup_drafts')
    .update({ project_id: projectId, email: '', payload: { publishIntent, editIntent } })
    .eq('id', id)
}

/** Reopens a claimed draft after a failed project insert so the user can retry. */
export async function releaseDraft(admin: Admin, id: string): Promise<void> {
  await admin.from('signup_drafts').update({ consumed_at: null, claimed_by: null }).eq('id', id)
}
