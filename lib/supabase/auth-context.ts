import type { AuthState, AuthUserSummary } from './auth-state'

/**
 * These headers are not cryptographically signed. They are trusted only after
 * middleware removes client copies and explicitly forwards its own request override.
 */
export const VERIFIED_USER_HEADERS = {
  state: 'x-gloval-auth-state',
  verified: 'x-gloval-auth-verified',
  id: 'x-gloval-auth-user-id',
  email: 'x-gloval-auth-user-email',
  emailConfirmedAt: 'x-gloval-auth-user-email-confirmed-at',
  createdAt: 'x-gloval-auth-user-created-at',
  phone: 'x-gloval-auth-user-phone',
  metadataFirstName: 'x-gloval-auth-user-metadata-first-name',
  metadataLastName: 'x-gloval-auth-user-metadata-last-name',
  metadataFullName: 'x-gloval-auth-user-metadata-full-name',
  metadataName: 'x-gloval-auth-user-metadata-name',
  metadataFirstNameCamel: 'x-gloval-auth-user-metadata-firstname',
  metadataLastNameCamel: 'x-gloval-auth-user-metadata-lastname',
  metadataPhone: 'x-gloval-auth-user-metadata-phone',
  metadataSignupDraftToken: 'x-gloval-auth-user-metadata-signup-draft-token',
} as const

export const VERIFIED_USER_HEADER_NAMES = Object.values(VERIFIED_USER_HEADERS)

type HeaderReader = {
  get(name: string): string | null
}

export function setUnauthenticatedAuthState(headers: Headers): void {
  headers.set(VERIFIED_USER_HEADERS.state, 'unauthenticated')
}

export function setUnavailableAuthState(headers: Headers): void {
  headers.set(VERIFIED_USER_HEADERS.state, 'unavailable')
}

export function clearVerifiedUserHeaders(headers: Headers): void {
  for (const name of VERIFIED_USER_HEADER_NAMES) headers.delete(name)
}

export function setVerifiedUserHeaders(
  headers: Headers,
  user: AuthUserSummary,
): void {
  headers.set(VERIFIED_USER_HEADERS.state, 'authenticated')
  headers.set(VERIFIED_USER_HEADERS.verified, '1')
  headers.set(VERIFIED_USER_HEADERS.id, user.id)
  headers.set(VERIFIED_USER_HEADERS.email, encodeURIComponent(user.email ?? ''))
  headers.set(
    VERIFIED_USER_HEADERS.emailConfirmedAt,
    user.email_confirmed_at ?? '',
  )
  headers.set(VERIFIED_USER_HEADERS.createdAt, user.created_at ?? '')
  headers.set(VERIFIED_USER_HEADERS.phone, encodeURIComponent(user.phone ?? ''))
  headers.set(
    VERIFIED_USER_HEADERS.metadataFirstName,
    encodeURIComponent(user.user_metadata?.first_name ?? ''),
  )
  headers.set(
    VERIFIED_USER_HEADERS.metadataLastName,
    encodeURIComponent(user.user_metadata?.last_name ?? ''),
  )
  headers.set(
    VERIFIED_USER_HEADERS.metadataFullName,
    encodeURIComponent(user.user_metadata?.full_name ?? ''),
  )
  headers.set(
    VERIFIED_USER_HEADERS.metadataName,
    encodeURIComponent(user.user_metadata?.name ?? ''),
  )
  headers.set(
    VERIFIED_USER_HEADERS.metadataFirstNameCamel,
    encodeURIComponent(user.user_metadata?.firstName ?? ''),
  )
  headers.set(
    VERIFIED_USER_HEADERS.metadataLastNameCamel,
    encodeURIComponent(user.user_metadata?.lastName ?? ''),
  )
  headers.set(
    VERIFIED_USER_HEADERS.metadataPhone,
    encodeURIComponent(user.user_metadata?.phone ?? ''),
  )
  headers.set(
    VERIFIED_USER_HEADERS.metadataSignupDraftToken,
    encodeURIComponent(user.user_metadata?.signup_draft_token ?? ''),
  )
}

function decodeHeader(headers: HeaderReader, name: string): string | null {
  try {
    return decodeURIComponent(headers.get(name) ?? '') || null
  } catch {
    return null
  }
}

export function getAuthStateFromHeaders(headers: HeaderReader): AuthState | null {
  const state = headers.get(VERIFIED_USER_HEADERS.state)
  if (state === 'unauthenticated') return { kind: 'unauthenticated' }
  if (state === 'unavailable') return { kind: 'unavailable' }
  if (state !== 'authenticated') return null

  const user = getVerifiedUserFromHeaders(headers)
  return user ? { kind: 'authenticated', user } : null
}

export function getVerifiedUserFromHeaders(
  headers: HeaderReader,
): AuthUserSummary | null {
  if (headers.get(VERIFIED_USER_HEADERS.verified) !== '1') return null

  const id = headers.get(VERIFIED_USER_HEADERS.id)
  if (!id) return null

  let email: string | null
  try {
    email = decodeURIComponent(headers.get(VERIFIED_USER_HEADERS.email) ?? '') || null
  } catch {
    return null
  }

  const userMetadata = {
    first_name: decodeHeader(headers, VERIFIED_USER_HEADERS.metadataFirstName),
    last_name: decodeHeader(headers, VERIFIED_USER_HEADERS.metadataLastName),
    full_name: decodeHeader(headers, VERIFIED_USER_HEADERS.metadataFullName),
    name: decodeHeader(headers, VERIFIED_USER_HEADERS.metadataName),
    firstName: decodeHeader(headers, VERIFIED_USER_HEADERS.metadataFirstNameCamel),
    lastName: decodeHeader(headers, VERIFIED_USER_HEADERS.metadataLastNameCamel),
    phone: decodeHeader(headers, VERIFIED_USER_HEADERS.metadataPhone),
    signup_draft_token: decodeHeader(headers, VERIFIED_USER_HEADERS.metadataSignupDraftToken),
  }
  const filteredMetadata = Object.fromEntries(
    Object.entries(userMetadata).filter(([, value]) => value !== null),
  ) as NonNullable<AuthUserSummary['user_metadata']>
  const phone = decodeHeader(headers, VERIFIED_USER_HEADERS.phone)

  return {
    id,
    email,
    email_confirmed_at:
      headers.get(VERIFIED_USER_HEADERS.emailConfirmedAt) || null,
    created_at: headers.get(VERIFIED_USER_HEADERS.createdAt) || null,
    ...(phone ? { phone } : {}),
    ...(Object.keys(filteredMetadata).length > 0 ? { user_metadata: filteredMetadata } : {}),
  }
}
