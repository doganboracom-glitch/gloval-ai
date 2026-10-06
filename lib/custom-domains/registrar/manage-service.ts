import { listDomainsForUser } from '../service'
import type { DomainErrorCode } from '../types'
import { REGISTRAR_CAPABILITIES, type RegistrarCapability } from './capabilities'
import { requireRegisteredByUs } from './ownership'
import { getDomainRegistrarProvider } from './provider'
import {
  isManageCapable,
  RegistrarError,
  type DomainContact,
  type DomainContactSet,
  type DomainManageCapable,
  type DomainRegistrarProvider,
  type ManagedDomainDetails,
} from './types'

/**
 * Registrar-side management for domains bought (or transferred in) through
 * Gloval. Every entry point re-derives ownership from the user id on the server;
 * nothing the client sends is trusted to say who owns a domain.
 *
 * Mutations are idempotent by construction: the adapter reads the provider's
 * state first and sends nothing when it already matches, so a double click or a
 * replayed request cannot cause a second change. Nothing here is paid.
 */

export type ManageResult<T extends object = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: DomainErrorCode }

export type Guard =
  | { ok: true; domain: string; registrar: DomainRegistrarProvider & DomainManageCapable }
  | { ok: false; error: DomainErrorCode }

export async function guard(userId: string, rawDomain: string): Promise<Guard> {
  const registrar = getDomainRegistrarProvider()
  if (!isManageCapable(registrar)) return { ok: false, error: 'REGISTRAR_UNAVAILABLE' }

  const domain = await requireRegisteredByUs(userId, rawDomain)
  if (domain) return { ok: true, domain, registrar }

  // Distinguish "not yours / unknown" from "yours, but connected from elsewhere".
  const normalized = rawDomain.trim().toLowerCase()
  const mine = await listDomainsForUser(userId)
  return { ok: false, error: mine.some((d) => d.domain === normalized) ? 'NOT_REGISTRAR_MANAGED' : 'NOT_FOUND' }
}

export function toDomainError(e: unknown): DomainErrorCode {
  if (e instanceof RegistrarError) {
    // Only the code is logged: never the message, which can carry provider detail.
    console.error('[registrar-manage] failed', e.code)
    if (e.code === 'INVALID_INPUT') return 'INVALID_INPUT'
    if (e.code === 'OUTCOME_UNKNOWN') return 'OUTCOME_UNKNOWN'
    if (e.code === 'NOT_CONFIGURED') return 'REGISTRAR_UNAVAILABLE'
    return 'PROVIDER_REFUSED'
  }
  console.error('[registrar-manage] unexpected failure')
  return 'UNEXPECTED_ERROR'
}

export type ManagedDomainView = {
  details: ManagedDomainDetails
  /** WHOIS contacts. Owner-only; never part of any list view. */
  contacts: DomainContactSet | null
  /** True when contacts could not be read (the rest of the page still renders). */
  contactsUnavailable: boolean
}

export async function loadManagedDomain(userId: string, rawDomain: string): Promise<ManageResult<ManagedDomainView>> {
  const g = await guard(userId, rawDomain)
  if (!g.ok) return g
  try {
    const details = await g.registrar.getManagedDetails(g.domain)
    if (!details) return { ok: false, error: 'NOT_FOUND' }
    let contacts: DomainContactSet | null = null
    let contactsUnavailable = false
    try {
      contacts = await g.registrar.getContacts(g.domain)
    } catch {
      contactsUnavailable = true
    }
    return { ok: true, details, contacts, contactsUnavailable }
  } catch (e) {
    return { ok: false, error: toDomainError(e) }
  }
}

async function mutate(
  userId: string,
  rawDomain: string,
  run: (registrar: DomainManageCapable, domain: string) => Promise<{ changed: boolean }>,
  capability?: RegistrarCapability,
): Promise<ManageResult<{ changed: boolean }>> {
  const g = await guard(userId, rawDomain)
  if (!g.ok) return g
  // Checked after ownership so a stranger learns nothing, and before any provider call.
  if (capability && !REGISTRAR_CAPABILITIES[capability]) return { ok: false, error: 'FEATURE_UNSUPPORTED' }
  try {
    const { changed } = await run(g.registrar, g.domain)
    return { ok: true, changed }
  } catch (e) {
    return { ok: false, error: toDomainError(e) }
  }
}

export function changeNameservers(userId: string, rawDomain: string, nameservers: string[]) {
  if (!Array.isArray(nameservers)) return Promise.resolve<ManageResult<{ changed: boolean }>>({ ok: false, error: 'INVALID_INPUT' })
  return mutate(userId, rawDomain, (r, d) => r.setNameservers(d, nameservers), 'nameserverChange')
}

export function changePrivacy(userId: string, rawDomain: string, enabled: boolean) {
  if (typeof enabled !== 'boolean') return Promise.resolve<ManageResult<{ changed: boolean }>>({ ok: false, error: 'INVALID_INPUT' })
  return mutate(userId, rawDomain, (r, d) => r.setPrivacy(d, enabled))
}

export function changeLock(userId: string, rawDomain: string, locked: boolean) {
  if (typeof locked !== 'boolean') return Promise.resolve<ManageResult<{ changed: boolean }>>({ ok: false, error: 'INVALID_INPUT' })
  return mutate(userId, rawDomain, (r, d) => r.changeLock(d, locked), 'transferLockChange')
}

export function changeContact(userId: string, rawDomain: string, contact: DomainContact) {
  if (!contact || typeof contact !== 'object') return Promise.resolve<ManageResult<{ changed: boolean }>>({ ok: false, error: 'INVALID_INPUT' })
  return mutate(userId, rawDomain, (r, d) => r.updateContacts(d, contact))
}
