import { describe, expect, it } from 'vitest'
import { resolveLoginNextPath } from '@/lib/auth-redirect'
import { getSignupDraftTokenFromNextPath, isSignupDraftToken } from '@/lib/signup-draft-shared'
import { sanitizeNextPath } from '@/lib/safe-redirect'

const DRAFT_TOKEN = 'c'.repeat(43)

describe('signup draft auth redirects', () => {
  it('sends a validated draft through login to the resume route', () => {
    expect(resolveLoginNextPath(DRAFT_TOKEN, '/dashboard')).toBe(
      `/auth/resume?draft=${DRAFT_TOKEN}`,
    )
  })

  it('rejects malformed draft values and unsafe next paths', () => {
    expect(isSignupDraftToken('not-a-claim-token')).toBe(false)
    expect(resolveLoginNextPath('not-a-claim-token', 'https://attacker.example')).toBe('/dashboard')
    expect(sanitizeNextPath('/\\attacker.example')).toBe('/dashboard')
  })

  it('only extracts a draft from the internal resume route', () => {
    expect(getSignupDraftTokenFromNextPath(`/auth/resume?draft=${DRAFT_TOKEN}`)).toBe(DRAFT_TOKEN)
    expect(getSignupDraftTokenFromNextPath(`https://attacker.example/auth/resume?draft=${DRAFT_TOKEN}`)).toBe(
      null,
    )
  })
})
