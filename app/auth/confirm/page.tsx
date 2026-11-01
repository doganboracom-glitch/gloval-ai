import { getSignupDraftTokenFromNextPath } from '@/lib/signup-draft-shared'
import { sanitizeNextPathWithDecoding } from '@/lib/safe-redirect'
import { isValidClaimToken } from '@/lib/signup-draft-core'
import { EmailConfirmationPrompt } from './prompt'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

type ConfirmationType = 'signup' | 'email' | 'recovery'

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const rawType = firstValue(params.type)
  const type: ConfirmationType | null =
    rawType === 'signup' || rawType === 'email' || rawType === 'recovery' ? rawType : null
  const isRecovery = type === 'recovery'
  const next = isRecovery
    ? '/auth/reset-password'
    : sanitizeNextPathWithDecoding(firstValue(params.next))
  const rawDraft = isRecovery ? null : firstValue(params.draft)
  const draft = isRecovery
    ? null
    : (isValidClaimToken(rawDraft) ? rawDraft : null) ?? getSignupDraftTokenFromNextPath(next)
  const rawTokenHash = firstValue(params.token_hash)?.trim() ?? ''
  const tokenHash = rawTokenHash && rawTokenHash.length <= 512 ? rawTokenHash : null

  return <EmailConfirmationPrompt tokenHash={tokenHash} type={type} draft={draft} next={next} />
}
