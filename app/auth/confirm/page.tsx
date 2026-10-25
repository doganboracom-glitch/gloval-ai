import { getSignupDraftTokenFromNextPath } from '@/lib/signup-draft-shared'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import { isValidClaimToken } from '@/lib/signup-draft-core'
import { EmailConfirmationPrompt } from './prompt'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

type ConfirmationType = 'signup' | 'email'

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const next = sanitizeNextPath(firstValue(params.next))
  const rawDraft = firstValue(params.draft)
  const draft =
    (isValidClaimToken(rawDraft) ? rawDraft : null) ?? getSignupDraftTokenFromNextPath(next)
  const rawTokenHash = firstValue(params.token_hash)?.trim() ?? ''
  const tokenHash = rawTokenHash && rawTokenHash.length <= 512 ? rawTokenHash : null
  const rawType = firstValue(params.type)
  const type: ConfirmationType | null =
    rawType === 'signup' || rawType === 'email' ? rawType : null

  return <EmailConfirmationPrompt tokenHash={tokenHash} type={type} draft={draft} next={next} />
}
