'use server'

import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { validateEmail } from '@/lib/email-validation'
import { hashedIpFromHeaders } from '@/lib/anon-ai-limit'
import { createProject } from '@/lib/projects'
import {
  type DraftFailure,
  isSignupIdeaDraftPayload,
  isValidClaimToken,
  parseDraftPayload,
} from '@/lib/signup-draft-core'
import { SIGNUP_IDEA_RESTORE_COOKIE } from '@/lib/signup-draft-shared'
import {
  DraftStoreError,
  claimDraft,
  completeDraft,
  completeIdeaDraft,
  createDraft,
  releaseDraft,
  reserveDraftIpSlot,
} from '@/lib/signup-draft-store'

function failure(reason: DraftFailure, code?: string): { ok: false; reason: DraftFailure } {
  // Reason and Postgres code only: never the e-mail, IP or draft content.
  if (reason === 'table_missing' || reason === 'storage') {
    console.error('[signup-draft] create failed:', reason, code ?? '')
  } else if (reason !== 'invalid') {
    console.log('[signup-draft] create refused:', reason)
  }
  return { ok: false, reason }
}

export type SignupIdeaRestoreResult =
  | { status: 'idea'; prompt: string }
  | { status: 'missing' | 'invalid' | 'unauthenticated' | 'busy' | 'error' }

export async function restoreSignupIdeaFromCookie(): Promise<SignupIdeaRestoreResult> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SIGNUP_IDEA_RESTORE_COOKIE)?.value
    if (!token) return { status: 'missing' }
    if (!isValidClaimToken(token)) {
      cookieStore.delete(SIGNUP_IDEA_RESTORE_COOKIE)
      return { status: 'invalid' }
    }

    const result = await resumeSignupDraft(token)
    if (result.status === 'idea') {
      cookieStore.delete(SIGNUP_IDEA_RESTORE_COOKIE)
      return result
    }
    if (result.status === 'unauthenticated') return result
    if (result.status === 'error' || result.status === 'busy') return result

    cookieStore.delete(SIGNUP_IDEA_RESTORE_COOKIE)
    return { status: 'invalid' }
  } catch {
    return { status: 'error' }
  }
}

export type PersistSignupIdeaResult =
  | { status: 'idea'; prompt: string }
  | { status: 'unauthenticated' | 'invalid' | 'error' }

export async function persistSignupIdeaForCurrentUser(
  rawPrompt: string,
): Promise<PersistSignupIdeaResult> {
  const payload = parseDraftPayload({ kind: 'idea', prompt: rawPrompt })
  if (!isSignupIdeaDraftPayload(payload)) return { status: 'invalid' }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user?.email) return { status: 'unauthenticated' }

    const parked = await parkDraftForEmail(data.user.email, payload)
    if (!parked.ok) return { status: 'error' }

    const cookieStore = await cookies()
    cookieStore.set(SIGNUP_IDEA_RESTORE_COOKIE, parked.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 300,
    })
    const result = await resumeSignupDraft(parked.token)
    if (result.status === 'idea') {
      cookieStore.delete(SIGNUP_IDEA_RESTORE_COOKIE)
      return result
    }
    if (result.status === 'unauthenticated') return result
    return { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}


/**
 * Called from the sign-up form (no session yet) to park the visitor's draft
 * server-side. Body is capped (200 KB), each IP gets 10 drafts per hour (durable
 * counter), each e-mail at most 3 active drafts. A failure never blocks sign-up:
 * the caller shows a notice instead.
 */
async function parkDraftForEmail(
  email: unknown,
  rawDraft: unknown,
): Promise<{ ok: true; token: string } | { ok: false; reason: DraftFailure }> {
  try {
    const payload = parseDraftPayload(rawDraft)
    if (!payload || typeof email !== 'string' || !validateEmail(email).ok) return failure('invalid')
    const admin = createAdminClient()
    const ipHash = hashedIpFromHeaders(await headers())
    if (!(await reserveDraftIpSlot(admin, ipHash))) return failure('rate_limited')
    const token = await createDraft(admin, { email, payload })
    return { ok: true, token }
  } catch (error) {
    if (error instanceof DraftStoreError) return failure(error.reason, error.code)
    return failure('storage')
  }
}

export async function createSignupDraft(input: {
  email: string
  draft: unknown
}): Promise<{ ok: true; token: string } | { ok: false; reason: DraftFailure }> {
  return parkDraftForEmail(input?.email, input?.draft)
}

export type ResumeResult =
  | { status: 'ok'; projectId: string; publishIntent: boolean; editIntent: boolean }
  | { status: 'idea'; prompt: string }
  | { status: 'busy' }
  | { status: 'unauthenticated' }
  | { status: 'invalid' }
  | { status: 'error' }

/**
 * Turns the signed-in user's own draft into a real project. Idempotent: whichever
 * tab gets there first creates it; any other tab just receives the same project id.
 */
export async function resumeSignupDraft(token: string): Promise<ResumeResult> {
  if (!isValidClaimToken(token)) return { status: 'invalid' }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user?.email) return { status: 'unauthenticated' }

  const admin = createAdminClient()
  const claim = await claimDraft(admin, { token, userId: user.id, email: user.email })
  if (claim.status === 'done_idea') return { status: 'idea', prompt: claim.prompt }
  if (claim.status === 'done') {
    return {
      status: 'ok',
      projectId: claim.projectId,
      publishIntent: claim.publishIntent,
      editIntent: claim.editIntent,
    }
  }
  if (claim.status !== 'claimed') return { status: claim.status }

  if (isSignupIdeaDraftPayload(claim.payload)) {
    try {
      await completeIdeaDraft(admin, claim.id, claim.payload)
      return { status: 'idea', prompt: claim.payload.prompt }
    } catch {
      await releaseDraft(admin, claim.id)
      return { status: 'error' }
    }
  }

  try {
    const projectId = await createProject({
      name: claim.payload.name,
      sector: claim.payload.sector,
      language: claim.payload.language,
      prompt: claim.payload.prompt,
      schema: claim.payload.schema as Parameters<typeof createProject>[0]['schema'],
    })
    await completeDraft(admin, claim.id, projectId, claim.payload.publishIntent, claim.payload.editIntent)
    return {
      status: 'ok',
      projectId,
      publishIntent: claim.payload.publishIntent,
      editIntent: claim.payload.editIntent,
    }
  } catch {
    await releaseDraft(admin, claim.id)
    return { status: 'error' }
  }
}
