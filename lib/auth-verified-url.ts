/**
 * Builds the `/auth/verified` success URL shared by the email-verification
 * routes. A pending signup draft is not claimed here: the verifying device may
 * not be the one that started the sign-up, so the draft is carried through
 * login (`next`) and claimed by `/auth/resume` once the user signs in.
 */
export function buildVerifiedUrl(origin: string, next: string, draft: string | null): URL {
  const url = new URL('/auth/verified', origin)
  url.searchParams.set('next', draft ? `/auth/resume?draft=${encodeURIComponent(draft)}` : next)
  return url
}
