import { describe, expect, it } from 'vitest'
import {
  buildSignUpLoginHref,
  buildSignUpSuccessHref,
  resolveLoginNextPath,
} from '@/lib/auth-redirect'
import { getSignupDraftTokenFromNextPath, isSignupDraftToken } from '@/lib/signup-draft-shared'
import { sanitizeNextPath } from '@/lib/safe-redirect'

const DRAFT_TOKEN = 'c'.repeat(43)

describe('support signup auth redirects', () => {
  const next = '/support/new?department=gloval-ads'

  it('keeps the prefilled support route through signup, confirmation, and the login link', () => {
    const expectedNext = encodeURIComponent(next)
    expect(buildSignUpSuccessHref(next)).toBe(`/auth/sign-up-success?next=${expectedNext}`)
    expect(buildSignUpLoginHref(next, false)).toBe(`/auth/login?next=${expectedNext}`)
    expect(buildSignUpLoginHref(next, true)).toBe(`/auth/login?next=${expectedNext}`)
  })

  it('rejects external return URLs', () => {
    expect(buildSignUpSuccessHref('https://attacker.example')).toBe('/auth/sign-up-success')
    expect(buildSignUpLoginHref('//attacker.example', false)).toBe('/auth/login')
  })
})

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
