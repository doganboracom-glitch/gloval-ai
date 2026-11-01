import 'server-only'
import type { AuthClientLike, AuthState } from './auth-state'
import { getRequestUser } from './request-user'

export async function getPageAuthState(_client?: AuthClientLike): Promise<AuthState> {
  return getRequestUser()
}
