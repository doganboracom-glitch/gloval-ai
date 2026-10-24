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
