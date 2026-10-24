'use server'

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { validateEmail } from '@/lib/email-validation'
import { createProject } from '@/lib/projects'
import { hashDraftIp, isMissingTableError, isValidClaimToken, parseDraftPayload } from '@/lib/signup-draft-core'
import { checkDraftLimits, claimDraft, completeDraft, createDraft, releaseDraft } from '@/lib/signup-draft-store'

export type CreateDraftResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'invalid' | 'limited' | 'storage_unavailable' }

/** Called from the sign-up form (no session yet) to park the visitor's draft server-side. */
export async function createSignupDraft(input: {
  email: string
  draft: unknown
}): Promise<CreateDraftResult> {
  try {
    const payload = parseDraftPayload(input.draft)
    if (!payload || !validateEmail(input.email).ok) return { ok: false, reason: 'invalid' }
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const ipHash = ip ? hashDraftIp(ip) : null
    const admin = createAdminClient()
    const limit = await checkDraftLimits(admin, { email: input.email, ipHash })
    if (limit) {
      console.log(`[signup-draft] rejected: ${limit} limit reached`)
      return { ok: false, reason: 'limited' }
    }
    const token = await createDraft(admin, { email: input.email, payload, ipHash })
    return { ok: true, token }
  } catch (error) {
    const detail = error instanceof Error ? error.message : (error as { message?: string } | null)?.message
    console.log(
      isMissingTableError(error)
        ? '[signup-draft] signup_drafts table is missing - run scripts/074-signup-drafts.sql:'
        : '[signup-draft] could not save draft:',
      detail ?? 'unknown',
    )
    return { ok: false, reason: 'storage_unavailable' }
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
    await completeDraft(admin, claim.id, projectId)
    return { status: 'ok', projectId, publishIntent: claim.payload.publishIntent }
  } catch {
    await releaseDraft(admin, claim.id)
    return { status: 'error' }
  }
}
