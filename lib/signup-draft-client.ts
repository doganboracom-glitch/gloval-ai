import { MAX_SIGNUP_IDEA_CHARS } from '@/lib/signup-draft-shared'

const KEY = 'gloval:signup-draft'

export function storeSignupDraftToken(token: string) {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // sessionStorage unavailable — the verification link still carries the token.
  }
}

export function readSignupDraftToken(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearSignupDraftToken() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // non-fatal
  }
}

const IDEA_KEY = 'gloval:signup-idea'

export function storeSignupIdea(idea: string): boolean {
  const normalized = idea.trim()
  if (!normalized || normalized.length > MAX_SIGNUP_IDEA_CHARS) return false
  try {
    sessionStorage.setItem(IDEA_KEY, normalized)
    return true
  } catch {
    return false
  }
}

export function readSignupIdea(): string | null {
  try {
    const idea = sessionStorage.getItem(IDEA_KEY)
    if (!idea) return null
    const normalized = idea.trim()
    if (!normalized || normalized.length > MAX_SIGNUP_IDEA_CHARS) {
      sessionStorage.removeItem(IDEA_KEY)
      return null
    }
    return normalized
  } catch {
    return null
  }
}

export function takeSignupIdea(): string | null {
  const idea = readSignupIdea()
  clearSignupIdea()
  return idea
}

export function clearSignupIdea() {
  try {
    sessionStorage.removeItem(IDEA_KEY)
  } catch {
    // non-fatal
  }
}

const FAILED_KEY = 'gloval:signup-draft-failed'

/** Remembers that the draft could not be parked, so the post-sign-up page can say so. */
export function setSignupDraftFailed(failed: boolean) {
  try {
    if (failed) sessionStorage.setItem(FAILED_KEY, '1')
    else sessionStorage.removeItem(FAILED_KEY)
  } catch {
    // non-fatal
  }
}

export function readSignupDraftFailed(): boolean {
  try {
    return sessionStorage.getItem(FAILED_KEY) === '1'
  } catch {
    return false
  }
}

export type PostSignUpStep =
  | { kind: 'resume'; token: string }
  | { kind: 'warn-draft-lost' }
  | { kind: 'dashboard' }
  | { kind: 'verify-email' }

/**
 * Decides what happens right after a successful sign-up. A session that already exists
 * (e-mail confirmation off, or direct redirect) skips the verification page, which is
 * where the "draft not saved" notice normally lives, so that case must warn here.
 */
export function resolvePostSignUp(input: {
  hasSession: boolean
  draftToken: string | null
  draftFailed: boolean
}): PostSignUpStep {
  if (!input.hasSession) return { kind: 'verify-email' }
  if (input.draftToken) return { kind: 'resume', token: input.draftToken }
  if (input.draftFailed) return { kind: 'warn-draft-lost' }
  return { kind: 'dashboard' }
}
