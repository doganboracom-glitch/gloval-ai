type AuthErrorDetails = {
  code?: unknown
  status?: unknown
}

/**
 * True when a PKCE code exchange failed only because this browser never held
 * the code verifier, i.e. the sign-up started on another browser or device.
 * Supabase raises this before contacting the server, so it says nothing about
 * the validity of the code itself.
 */
export function isPkceVerifierMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const details = error as AuthErrorDetails & { name?: unknown }
  return (
    details.code === 'pkce_code_verifier_not_found' ||
    details.name === 'AuthPKCECodeVerifierMissingError'
  )
}

export function logSupabaseAuthFailure(scope: string, error: unknown): void {
  const details = error && typeof error === 'object' ? (error as AuthErrorDetails) : {}
  const code =
    typeof details.code === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(details.code)
      ? details.code
      : 'unknown'
  const status =
    typeof details.status === 'number' && Number.isInteger(details.status) ? details.status : null

  console.error(`[${scope}] Supabase Auth operation failed`, { code, status })
}
