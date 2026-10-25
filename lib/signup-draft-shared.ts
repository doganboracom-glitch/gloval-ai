export const MAX_SIGNUP_IDEA_CHARS = 2_000
export const SIGNUP_IDEA_RESTORE_COOKIE = 'gloval_signup_idea_restore'

const SIGNUP_DRAFT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isSignupDraftToken(value: unknown): value is string {
  return typeof value === 'string' && SIGNUP_DRAFT_TOKEN_PATTERN.test(value)
}

export function getSignupDraftTokenFromNextPath(value: string | null | undefined): string | null {
  if (!value) return null

  try {
    const url = new URL(value, 'https://gloval.invalid')
    if (url.origin !== 'https://gloval.invalid' || url.pathname !== '/auth/resume') return null
    const draft = url.searchParams.get('draft')
    return isSignupDraftToken(draft) ? draft : null
  } catch {
    return null
  }
}
