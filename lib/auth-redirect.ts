/**
 * Resolves where Supabase should redirect the browser after an email link
 * (signup confirmation, resend, password reset) is clicked.
 *
 * On any real host — production (`gloval.ai`) or a Vercel preview — this is
 * always the actual browser origin, so the link lands back on the site the
 * user is really on. `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` only applies
 * when actually running on `localhost`, for local setups that need a fixed
 * dev URL allow-listed in Supabase. The previous code checked the env var
 * FIRST regardless of host, which is exactly what sent production
 * verification links to `localhost:3000`.
 */
export function getAuthCallbackUrl(path = '/auth/callback'): string {
  const { hostname, origin } = window.location
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1'
  const devOverride = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL?.trim()
  if (isLocalHost && devOverride) return devOverride
  return `${origin}${path}`
}
