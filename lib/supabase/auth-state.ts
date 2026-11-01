import type { User } from '@supabase/supabase-js'

export type AuthUserSummary = {
  id: string
  email: string | null
  email_confirmed_at: string | null
  created_at: string | null
}

export type AuthState =
  | { kind: 'authenticated'; user: AuthUserSummary }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }

type AuthResult = {
  data?: { user?: User | null } | null
  error?: unknown
}

export type AuthClientLike = {
  auth: {
    getUser: () => Promise<AuthResult>
  }
}

type AuthErrorDetails = {
  code?: string
  message?: string
  name?: string
  status?: number
}

const DEFINITE_AUTH_FAILURE_CODES = new Set([
  'bad_jwt',
  'invalid_jwt',
  'invalid_token',
  'jwt_expired',
  'session_not_found',
  'token_expired',
  'user_not_found',
])

function getErrorDetails(error: unknown): AuthErrorDetails {
  if (!error || typeof error !== 'object') return {}

  const candidate = error as Record<string, unknown>
  const status = Number(candidate.status)

  return {
    code: typeof candidate.code === 'string' ? candidate.code.toLowerCase() : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    status: Number.isFinite(status) ? status : undefined,
  }
}

function isDefiniteAuthFailure(error: unknown): boolean {
  const details = getErrorDetails(error)
  if (details.status === 401) return true
  if (details.code && DEFINITE_AUTH_FAILURE_CODES.has(details.code)) return true
  if (details.name === 'AuthSessionMissingError') return true

  return Boolean(
    details.message &&
      /\b(jwt|token)\b.*\b(expired|invalid|malformed)\b|\bno session\b/i.test(
        details.message,
      ),
  )
}

export function classifyAuthResult(result: AuthResult): AuthState {
  const user = result.data?.user
  const error = result.error

  if (!error && user) {
    return {
      kind: 'authenticated',
      user: {
        id: user.id,
        email: user.email ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        created_at: user.created_at ?? null,
      },
    }
  }

  if (!error) return { kind: 'unauthenticated' }

  const { status } = getErrorDetails(error)
  if (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  ) {
    return { kind: 'unavailable' }
  }

  if (isDefiniteAuthFailure(error)) return { kind: 'unauthenticated' }

  return { kind: 'unavailable' }
}

export async function getUserAuthState(client: AuthClientLike): Promise<AuthState> {
  try {
    return classifyAuthResult(await client.auth.getUser())
  } catch {
    return { kind: 'unavailable' }
  }
}

export const AUTH_RETRY_AFTER_SECONDS = 5
