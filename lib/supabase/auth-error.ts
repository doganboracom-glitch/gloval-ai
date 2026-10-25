type AuthErrorDetails = {
  code?: unknown
  status?: unknown
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
