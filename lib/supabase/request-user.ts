import 'server-only'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getVerifiedUserFromHeaders } from './auth-context'
import { getUserAuthState, type AuthState, type AuthUserSummary } from './auth-state'
import { cacheRequestUser } from './request-user-cache'

export type AuthUnavailableActionResult = {
  ok: false
  reason: 'auth_unavailable'
}

export class AuthUnavailableError extends Error {
  readonly reason = 'auth_unavailable' as const

  constructor() {
    super('AUTH_UNAVAILABLE')
    this.name = 'AuthUnavailableError'
  }
}

async function resolveRequestUser(): Promise<AuthState> {
  try {
    const requestHeaders = await headers()
    const verifiedUser = getVerifiedUserFromHeaders(requestHeaders)
    if (verifiedUser) return { kind: 'authenticated', user: verifiedUser }

    const supabase = await createClient()
    return await getUserAuthState(supabase)
  } catch {
    return { kind: 'unavailable' }
  }
}

/** React invalidates this memoized result between Server Component requests. */
export const getRequestUser = cacheRequestUser(resolveRequestUser)

export async function requireRequestUser(): Promise<AuthUserSummary> {
  const state = await getRequestUser()
  if (state.kind === 'authenticated') return state.user
  if (state.kind === 'unavailable') throw new AuthUnavailableError()
  throw new Error('UNAUTHENTICATED')
}

export function authUnavailableActionResult(): AuthUnavailableActionResult {
  return { ok: false, reason: 'auth_unavailable' }
}
