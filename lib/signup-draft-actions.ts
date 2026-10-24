'use server'

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { validateEmail } from '@/lib/email-validation'
import { hashedIpFromHeaders } from '@/lib/anon-ai-limit'
import { createProject } from '@/lib/projects'
import { type DraftFailure, isValidClaimToken, parseDraftPayload } from '@/lib/signup-draft-core'
import {
  DraftStoreError,
  claimDraft,
  completeDraft,
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

/**
 * Called from the sign-up form (no session yet) to park the visitor's draft
 * server-side. Body is capped (200 KB), each IP gets 10 drafts per hour (durable
 * counter), each e-mail at most 3 active drafts. A failure never blocks sign-up:
 * the caller shows a notice instead.
 */
export async function createSignupDraft(input: {
  email: string
  draft: unknown
}): Promise<{ ok: true; token: string } | { ok: false; reason: DraftFailure }> {
  try {
    const payload = parseDraftPayload(input.draft)
    if (!payload || typeof input.email !== 'string' || !validateEmail(input.email).ok) {
      return failure('invalid')
    }
    const admin = createAdminClient()
    const ipHash = hashedIpFromHeaders(await headers())
    if (!(await reserveDraftIpSlot(admin, ipHash))) return failure('rate_limited')
    const token = await createDraft(admin, { email: input.email, payload })
    return { ok: true, token }
  } catch (error) {
    if (error instanceof DraftStoreError) return failure(error.reason, error.code)
    return failure('storage')
  }
}

export type ResumeResult =
  | { status: 'ok'; projectId: string; publishIntent: boolean }
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
  if (claim.status === 'done') return { status: 'ok', projectId: claim.projectId, publishIntent: claim.publishIntent }
  if (claim.status !== 'claimed') return { status: claim.status }

  try {
    const projectId = await createProject({
      name: claim.payload.name,
      sector: claim.payload.sector,
      language: claim.payload.language,
      prompt: claim.payload.prompt,
      schema: claim.payload.schema as Parameters<typeof createProject>[0]['schema'],
    })
    await completeDraft(admin, claim.id, projectId, claim.payload.publishIntent)
    return { status: 'ok', projectId, publishIntent: claim.payload.publishIntent }
  } catch {
    await releaseDraft(admin, claim.id)
    return { status: 'error' }
  }
}
