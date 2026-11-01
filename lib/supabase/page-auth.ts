import 'server-only'
import { headers } from 'next/headers'
import { getVerifiedUserFromHeaders } from './auth-context'
import { getUserAuthState, type AuthClientLike, type AuthState } from './auth-state'

export async function getPageAuthState(client: AuthClientLike): Promise<AuthState> {
  const state = await getUserAuthState(client)
  if (state.kind !== 'unavailable') return state

  try {
    const verifiedUser = getVerifiedUserFromHeaders(await headers())
    if (verifiedUser) return { kind: 'authenticated', user: verifiedUser }
  } catch {
    return state
  }

  return state
}
