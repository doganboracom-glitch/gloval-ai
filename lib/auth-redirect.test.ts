import { describe, expect, it } from 'vitest'
import { getSignupLoginHref, resolveLoginNextPath } from '@/lib/auth-redirect'
import { getSignupDraftTokenFromNextPath, isSignupDraftToken } from '@/lib/signup-draft-shared'
import { sanitizeNextPath } from '@/lib/safe-redirect'

const DRAFT_TOKEN = 'c'.repeat(43)

describe('signup login link next path', () => {
  it('preserves the support path and department query after sanitizing next', () => {
    expect(getSignupLoginHref('/support/new?department=gloval-ads', false)).toBe(
      '/auth/login?next=%2Fsupport%2Fnew%3Fdepartment%3Dgloval-ads',
    )
  })

  it('rejects an unsafe next and keeps the draft-idea restore link', () => {
    expect(getSignupLoginHref('https://attacker.example', false)).toBe('/auth/login')
    expect(getSignupLoginHref('/support/new?department=gloval-ads', true)).toBe(
      '/auth/login?next=%2Fauth%2Frestore-idea',
    )
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
