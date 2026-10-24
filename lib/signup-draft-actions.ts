'use server'

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { validateEmail } from '@/lib/email-validation'
import { createProject } from '@/lib/projects'
import { isValidClaimToken, parseDraftPayload } from '@/lib/signup-draft-core'
import { claimDraft, completeDraft, createDraft, releaseDraft } from '@/lib/signup-draft-store'

/** Called from the sign-up form (no session yet) to park the visitor's draft server-side. */
export async function createSignupDraft(input: {
  email: string
  draft: unknown
}): Promise<{ ok: true; token: string } | { ok: false }> {
  try {
    const payload = parseDraftPayload(input.draft)
    if (!payload || !validateEmail(input.email).ok) return { ok: false }
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`signup-draft:${ip}`, 5, 10 * 60 * 1000).allowed) return { ok: false }
    const token = await createDraft(createAdminClient(), { email: input.email, payload })
    return { ok: true, token }
  } catch {
    return { ok: false }
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
