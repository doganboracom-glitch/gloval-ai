import type { AuthUserSummary } from './auth-state'

/**
 * These headers are not cryptographically signed. They are trusted only after
 * middleware removes client copies and explicitly forwards its own request override.
 */
export const VERIFIED_USER_HEADERS = {
  verified: 'x-gloval-auth-verified',
  id: 'x-gloval-auth-user-id',
  email: 'x-gloval-auth-user-email',
  emailConfirmedAt: 'x-gloval-auth-user-email-confirmed-at',
  createdAt: 'x-gloval-auth-user-created-at',
} as const

export const VERIFIED_USER_HEADER_NAMES = Object.values(VERIFIED_USER_HEADERS)

type HeaderReader = {
  get(name: string): string | null
}

export function clearVerifiedUserHeaders(headers: Headers): void {
  for (const name of VERIFIED_USER_HEADER_NAMES) headers.delete(name)
}

export function setVerifiedUserHeaders(
  headers: Headers,
  user: AuthUserSummary,
): void {
  headers.set(VERIFIED_USER_HEADERS.verified, '1')
  headers.set(VERIFIED_USER_HEADERS.id, user.id)
  headers.set(VERIFIED_USER_HEADERS.email, encodeURIComponent(user.email ?? ''))
  headers.set(
    VERIFIED_USER_HEADERS.emailConfirmedAt,
    user.email_confirmed_at ?? '',
  )
  headers.set(VERIFIED_USER_HEADERS.createdAt, user.created_at ?? '')
}

export function getVerifiedUserFromHeaders(
  headers: HeaderReader,
): AuthUserSummary | null {
  if (headers.get(VERIFIED_USER_HEADERS.verified) !== '1') return null

  const id = headers.get(VERIFIED_USER_HEADERS.id)
  if (!id) return null

  let email: string | null = null
  try {
    email = decodeURIComponent(headers.get(VERIFIED_USER_HEADERS.email) ?? '') || null
  } catch {
    return null
  }

  return {
    id,
    email,
    email_confirmed_at:
      headers.get(VERIFIED_USER_HEADERS.emailConfirmedAt) || null,
    created_at: headers.get(VERIFIED_USER_HEADERS.createdAt) || null,
  }
}
