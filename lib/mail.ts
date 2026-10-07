'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyCurrentPlan, getMySubscription } from '@/lib/billing'
import { getMailProvider } from '@/lib/mail/provider'
import {
  getMyMailDomainGate,
  getMyMailDomains,
  listAllMailDomains,
  type MailDomainGate,
} from '@/lib/mail/domain-service'
import { getMailQuota } from '@/lib/mail/access'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { validateMailboxPassword } from '@/lib/mail/password'
import { validateAliasDestinations } from '@/lib/mail/alias-destinations'
import {
  MailError,
  isValidLocalPart,
  type MailAlias,
  type MailDomain,
  type MailErrorCode,
  type MailLogEntry,
  type MailLogStatus,
  type MailResult,
  type Mailbox,
  type MailboxStatus,
} from '@/lib/mail/types'

/**
 * Corporate mail server actions.
 *
 * Customer actions re-derive the caller from the session on every call and
 * resolve the target domain from the caller's own domain list, so a
 * client-supplied `domainId` can never be used to reach another tenant's mail.
 *
 * Quota is enforced HERE, not in the UI. The disabled "add mailbox" button is a
 * usability hint; this module is the authority.
 */

export type MailOverview = {
  domain: MailDomain | null
  /**
   * Custom-domain state from the shared domain layer, so the Email page can
   * tell "no domain connected" apart from "connected but not verified" and
   * point the customer at /dashboard/domains instead of dead-ending.
   */
  gate: MailDomainGate
  mailboxes: Mailbox[]
  aliases: MailAlias[]
  quota: { allowed: boolean; maxMailboxes: number; quotaMbPerBox: number; reason?: string }
  webmailBase: string | null
  /** True when a real provider is connected (vs. the in-memory mock). */
  live: boolean
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new MailError('UNAUTHENTICATED')
  return user
}

function fail(error: unknown): { ok: false; error: MailErrorCode } {
  if (error instanceof MailError) return { ok: false, error: error.code }
  // Never leak an internal message to the client; the UI localizes codes.
  console.log('[v0] mail action failed:', error)
  return { ok: false, error: 'NOT_FOUND' }
}

/**
 * Resolve the caller's own domain, or throw FORBIDDEN. Passing no id returns
 * the caller's first domain, which is the common single-domain case.
 */
async function requireOwnedDomain(userId: string, domainId?: string): Promise<MailDomain> {
  const mine = await getMyMailDomains(userId)
  const domain = domainId ? mine.find((d) => d.id === domainId) : mine[0]
  if (!domain) throw new MailError('FORBIDDEN')
  return domain
}

/** Everything the customer Email page needs, in one round trip. */
export async function getMyMailOverview(): Promise<MailOverview> {
  const user = await requireUser()
  const provider = getMailProvider()

  const [plan, subscription, domains, gate] = await Promise.all([
    getMyCurrentPlan(),
    getMySubscription(),
    getMyMailDomains(user.id),
    getMyMailDomainGate(user.id),
  ])

  const quota = getMailQuota(plan, subscription)
  const domain = domains[0] ?? null

  if (!domain || !quota.allowed) {
    return {
      domain,
      gate,
      mailboxes: [],
      aliases: [],
      quota,
      webmailBase: null,
      live: provider.id !== 'mock',
    }
  }

  const [mailboxes, aliases] = await Promise.all([
    provider.listMailboxes(domain.id),
    provider.listAliases(domain.id),
  ])

  return {
    domain,
    gate,
    mailboxes,
    aliases,
    quota,
    webmailBase: provider.webmailUrl(),
    live: provider.id !== 'mock',
  }
}

export async function createMyMailbox(input: {
  domainId: string
  localPart: string
  displayName: string
  password: string
  passwordConfirm: string
}): Promise<MailResult<Mailbox>> {
  try {
    const user = await requireUser()
    const [plan, subscription] = await Promise.all([getMyCurrentPlan(), getMySubscription()])
    const quota = getMailQuota(plan, subscription)
    if (!quota.allowed) throw new MailError('FORBIDDEN')

    // Re-validated here: the dialog's checklist is only a usability aid.
    if (validateMailboxPassword(input.password, input.passwordConfirm).length > 0) {
      throw new MailError('INVALID_PASSWORD')
    }

    const domain = await requireOwnedDomain(user.id, input.domainId)
    const provider = getMailProvider()

    // Re-count server-side: the client's view of the list may be stale or forged.
    const existing = await provider.listMailboxes(domain.id)
    if (existing.length >= quota.maxMailboxes) throw new MailError('MAILBOX_LIMIT_REACHED')

    const mailbox = await provider.createMailbox({
      domainId: domain.id,
      localPart: input.localPart,
      displayName: input.displayName,
      // Quota per box comes from the plan, never from the client.
      quotaMb: quota.quotaMbPerBox,
      password: input.password,
    })

    revalidatePath('/dashboard/email')
    return { ok: true, data: mailbox }
  } catch (error) {
    return fail(error)
  }
}

export async function updateMyMailbox(
  mailboxId: string,
  input: { displayName?: string; status?: MailboxStatus },
): Promise<MailResult<Mailbox>> {
  try {
    const user = await requireUser()
    const domain = await requireOwnedDomain(user.id)
    const provider = getMailProvider()

    const owned = await provider.listMailboxes(domain.id)
    if (!owned.some((m) => m.id === mailboxId)) throw new MailError('FORBIDDEN')

    // `quotaMb` is intentionally not accepted from the client: box size is a
    // function of the plan, not a user-editable field.
    const mailbox = await provider.updateMailbox(mailboxId, {
      displayName: input.displayName,
      status: input.status,
    })

    revalidatePath('/dashboard/email')
    return { ok: true, data: mailbox }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteMyMailbox(mailboxId: string): Promise<MailResult<null>> {
  try {
    const user = await requireUser()
    const domain = await requireOwnedDomain(user.id)
    const provider = getMailProvider()

    const owned = await provider.listMailboxes(domain.id)
    if (!owned.some((m) => m.id === mailboxId)) throw new MailError('FORBIDDEN')

    await provider.deleteMailbox(mailboxId)
    revalidatePath('/dashboard/email')
    return { ok: true, data: null }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Sets a mailbox password chosen by the customer. The password goes straight to
 * the provider: it is not logged, stored, returned, or put in any error.
 */
export async function setMyMailboxPassword(
  mailboxId: string,
  input: { password: string; passwordConfirm: string },
): Promise<MailResult<null>> {
  try {
    const user = await requireUser()
    const [plan, subscription] = await Promise.all([getMyCurrentPlan(), getMySubscription()])
    if (!getMailQuota(plan, subscription).allowed) throw new MailError('FORBIDDEN')

    if (validateMailboxPassword(input?.password, input?.passwordConfirm).length > 0) {
      throw new MailError('INVALID_PASSWORD')
    }

    const domain = await requireOwnedDomain(user.id)
    const provider = getMailProvider()

    const owned = await provider.listMailboxes(domain.id)
    if (!owned.some((m) => m.id === mailboxId)) throw new MailError('FORBIDDEN')

    await provider.setPassword(mailboxId, input.password)
    return { ok: true, data: null }
  } catch (error) {
    // Deliberately no `fail()` here: it logs the raw error object.
    const code: MailErrorCode = error instanceof MailError ? error.code : 'PASSWORD_UPDATE_FAILED'
    console.log('[v0] mailbox password update failed:', code)
    return { ok: false, error: code }
  }
}

export async function createMyAlias(input: {
  domainId: string
  localPart: string
  destinations: string[]
}): Promise<MailResult<MailAlias>> {
  try {
    const user = await requireUser()
    const [plan, subscription] = await Promise.all([getMyCurrentPlan(), getMySubscription()])
    if (!getMailQuota(plan, subscription).allowed) throw new MailError('FORBIDDEN')

    const domain = await requireOwnedDomain(user.id, input.domainId)
    const provider = getMailProvider()

    const localPart = typeof input.localPart === 'string' ? input.localPart.trim().toLowerCase() : ''
    if (!isValidLocalPart(localPart)) throw new MailError('INVALID_ADDRESS')
    const address = `${localPart}@${domain.domain.toLowerCase()}`

    // Re-read the caller's own mailboxes and aliases: this set is what makes an
    // address on their domain a legal destination, so a forged request cannot
    // target an address that is not theirs. External addresses skip it.
    const [mailboxes, aliases] = await Promise.all([
      provider.listMailboxes(domain.id),
      provider.listAliases(domain.id),
    ])
    const known = new Set([
      ...mailboxes.map((m) => m.address.toLowerCase()),
      ...aliases.map((a) => a.address.toLowerCase()),
    ])
    // A mailbox and an alias cannot share an address, and the customer needs to
    // be told which one is in the way.
    if (mailboxes.some((m) => m.address.toLowerCase() === address)) throw new MailError('ADDRESS_IS_MAILBOX')
    if (aliases.some((a) => a.address.toLowerCase() === address)) throw new MailError('ALIAS_EXISTS')

    const checked = validateAliasDestinations({
      aliasAddress: address,
      domain: domain.domain,
      destinations: input.destinations,
      internalAddresses: known,
    })
    if (!checked.ok) throw new MailError(checked.code)

    const alias = await provider.createAlias({
      domainId: domain.id,
      localPart,
      destinations: checked.destinations,
    })

    revalidatePath('/dashboard/email')
    return { ok: true, data: alias }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteMyAlias(aliasId: string): Promise<MailResult<null>> {
  try {
    const user = await requireUser()
    const domain = await requireOwnedDomain(user.id)
    const provider = getMailProvider()

    const owned = await provider.listAliases(domain.id)
    if (!owned.some((a) => a.id === aliasId)) throw new MailError('FORBIDDEN')

    await provider.deleteAlias(aliasId)
    revalidatePath('/dashboard/email')
    return { ok: true, data: null }
  } catch (error) {
    return fail(error)
  }
}

/** Turns an existing alias on or off. Ownership is re-checked against the caller's own alias list. */
export async function setMyAliasActive(aliasId: string, active: boolean): Promise<MailResult<null>> {
  try {
    const user = await requireUser()
    const [plan, subscription] = await Promise.all([getMyCurrentPlan(), getMySubscription()])
    if (!getMailQuota(plan, subscription).allowed) throw new MailError('FORBIDDEN')

    const domain = await requireOwnedDomain(user.id)
    const provider = getMailProvider()

    const owned = await provider.listAliases(domain.id)
    if (!owned.some((a) => a.id === aliasId)) throw new MailError('FORBIDDEN')

    await provider.setAliasActive(aliasId, active === true)
    revalidatePath('/dashboard/email')
    return { ok: true, data: null }
  } catch (error) {
    return fail(error)
  }
}

/* ------------------------------- admin side ------------------------------- */

export type AdminMailStats = {
  domains: number
  activeDomains: number
  mailboxes: number
  aliases: number
  storageUsedMb: number
  delivered24h: number
  failed24h: number
}

export async function adminMailStats(): Promise<AdminMailStats> {
  await requireAdmin()
  const provider = getMailProvider()

  try {
    const domains = await listAllMailDomains()
    const perDomain = await Promise.all(
      domains.map(async (d) => ({
        mailboxes: await provider.listMailboxes(d.id),
        aliases: await provider.listAliases(d.id),
      })),
    )
    const logs = await provider.listLogs({ limit: 500 })

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    const recent = logs.filter((l) => new Date(l.at).getTime() >= dayAgo)

    return {
      domains: domains.length,
      activeDomains: domains.filter((d) => d.status === 'active').length,
      mailboxes: perDomain.reduce((sum, d) => sum + d.mailboxes.length, 0),
      aliases: perDomain.reduce((sum, d) => sum + d.aliases.length, 0),
      storageUsedMb: perDomain.reduce(
        (sum, d) => sum + d.mailboxes.reduce((s, m) => s + m.usedMb, 0),
        0,
      ),
      delivered24h: recent.filter((l) => l.status === 'delivered').length,
      failed24h: recent.filter((l) => l.status !== 'delivered').length,
    }
  } catch (error) {
    console.log('[v0] admin mail stats unavailable:', error)
    return {
      domains: 0,
      activeDomains: 0,
      mailboxes: 0,
      aliases: 0,
      storageUsedMb: 0,
      delivered24h: 0,
      failed24h: 0,
    }
  }
}

export async function adminListDomains(): Promise<MailDomain[]> {
  await requireAdmin()
  return listAllMailDomains()
}

export async function adminVerifyDomain(domainId: string): Promise<MailResult<MailDomain>> {
  try {
    await requireAdmin()
    const domain = await getMailProvider().verifyDomain(domainId)
    revalidatePath('/admin/mail/domains')
    return { ok: true, data: domain }
  } catch (error) {
    return fail(error)
  }
}

/** Mailboxes across every domain, annotated with their domain name. */
export async function adminListMailboxes(): Promise<Array<Mailbox & { domain: string }>> {
  await requireAdmin()
  const provider = getMailProvider()
  const domains = await listAllMailDomains()

  const nested = await Promise.all(
    domains.map(async (d) =>
      (await provider.listMailboxes(d.id)).map((m) => ({ ...m, domain: d.domain })),
    ),
  )
  return nested.flat()
}

export async function adminListAliases(): Promise<Array<MailAlias & { domain: string }>> {
  await requireAdmin()
  const provider = getMailProvider()
  const domains = await listAllMailDomains()

  const nested = await Promise.all(
    domains.map(async (d) =>
      (await provider.listAliases(d.id)).map((a) => ({ ...a, domain: d.domain })),
    ),
  )
  return nested.flat()
}

export async function adminListLogs(filter?: {
  status?: MailLogStatus
  search?: string
}): Promise<MailLogEntry[]> {
  await requireAdmin()
  try {
    return await getMailProvider().listLogs({
      status: filter?.status,
      search: filter?.search,
      limit: 200,
    })
  } catch (error) {
    console.log('[v0] admin mail logs unavailable:', error)
    return []
  }
}
