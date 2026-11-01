'use server'

import { revalidatePath } from 'next/cache'
import { getRequestUser, authUnavailableActionResult, type AuthUnavailableActionResult } from '@/lib/supabase/request-user'
import type { DomainErrorCode } from '../types'
import {
  changeContact,
  changeLock,
  changeNameservers,
  changePrivacy,
  loadManagedDomain,
  type ManagedDomainView,
} from './manage-service'
import type { DomainContact } from './types'

/**
 * Client-facing wrappers. The user id comes from the session only; the domain
 * name from the client is just a lookup key that the service re-checks against
 * the caller's own registrar-managed domains.
 */

type MutationResult = { ok: true; changed: boolean } | { ok: false; error: DomainErrorCode } | AuthUnavailableActionResult
type LoadResult = ({ ok: true } & ManagedDomainView) | { ok: false; error: DomainErrorCode } | AuthUnavailableActionResult

type SessionUser = { userId: string } | { ok: false; error: DomainErrorCode } | AuthUnavailableActionResult

async function sessionUserId(): Promise<SessionUser> {
  const authState = await getRequestUser()
  if (authState.kind === 'unavailable') return authUnavailableActionResult()
  if (authState.kind === 'unauthenticated') return { ok: false, error: 'UNAUTHENTICATED' }
  return { userId: authState.user.id }
}

async function afterChange(result: MutationResult): Promise<MutationResult> {
  // Also refresh after an unconfirmed outcome: the provider state may have moved.
  if (result.ok || ('error' in result && result.error === 'OUTCOME_UNKNOWN')) {
    revalidatePath('/dashboard/domains')
  }
  return result
}

export async function loadManagedDomainAction(domain: string): Promise<LoadResult> {
  const session = await sessionUserId()
  if (!('userId' in session)) return session
  const { userId } = session
  return loadManagedDomain(userId, String(domain ?? ''))
}

export async function updateNameserversAction(domain: string, nameservers: string[]): Promise<MutationResult> {
  const session = await sessionUserId()
  if (!('userId' in session)) return session
  const { userId } = session
  return afterChange(await changeNameservers(userId, String(domain ?? ''), nameservers))
}

export async function setPrivacyAction(domain: string, enabled: boolean): Promise<MutationResult> {
  const session = await sessionUserId()
  if (!('userId' in session)) return session
  const { userId } = session
  return afterChange(await changePrivacy(userId, String(domain ?? ''), enabled))
}

export async function setLockAction(domain: string, locked: boolean): Promise<MutationResult> {
  const session = await sessionUserId()
  if (!('userId' in session)) return session
  const { userId } = session
  return afterChange(await changeLock(userId, String(domain ?? ''), locked))
}

export async function updateContactAction(domain: string, contact: DomainContact): Promise<MutationResult> {
  const session = await sessionUserId()
  if (!('userId' in session)) return session
  const { userId } = session
  return afterChange(await changeContact(userId, String(domain ?? ''), contact))
}
