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

const UNSAVED_KEY = 'gloval:signup-draft-unsaved'

/** Remembers that the draft could not be parked server-side, for the next screen. */
export function markSignupDraftUnsaved() {
  try {
    sessionStorage.setItem(UNSAVED_KEY, '1')
  } catch {
    // non-fatal
  }
}

export function consumeSignupDraftUnsaved(): boolean {
  try {
    const flagged = sessionStorage.getItem(UNSAVED_KEY) === '1'
    if (flagged) sessionStorage.removeItem(UNSAVED_KEY)
    return flagged
  } catch {
    return false
  }
}
