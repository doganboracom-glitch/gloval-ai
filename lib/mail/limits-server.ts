import { computeMailAccess, type MailAccessStatus } from './access-state'
import { loadMailGrants } from './access-sources'
import { defaultMailAccessDeps, supabaseMailAccessStore, type MailAccessDomainRow } from './access-sync'
import {
  computeMailboxLimit,
  grantsToAccessSources,
  hasAnyMailSource,
  type MailGrants,
  type MailboxLimit,
} from './mailbox-limits'

/**
 * Server-side inputs for mailbox limits and the page's access banners.
 *
 * Access is recomputed live from the owner's grants instead of trusting the
 * stored `mail_access_status`: the stored value can lag behind a renewal or an
 * expiry until the next sync, and creation checks must not be fooled by that.
 * The stored row is only the fallback when the live computation cannot run.
 */

export type MailDomainAccess = {
  status: MailAccessStatus
  graceDaysRemaining: number | null
  graceEndsAt: string | null
}

export type MailLimitContext = {
  grants: MailGrants
  /** Owner has, or ever had, a main package with mail or a mail add-on. */
  hasMailSource: boolean
  access: MailDomainAccess
  /** Active sources only while `access.status === 'active'`; otherwise what renewal would restore. */
  limit: MailboxLimit
}

const DAY_MS = 86_400_000

function accessFromStoredRow(row: MailAccessDomainRow, now: Date): MailDomainAccess {
  const ends = row.graceEndsAt ? new Date(row.graceEndsAt) : null
  const remaining =
    row.mailAccessStatus === 'grace' && ends && !Number.isNaN(ends.getTime())
      ? Math.max(1, Math.ceil((ends.getTime() - now.getTime()) / DAY_MS))
      : null
  return { status: row.mailAccessStatus, graceDaysRemaining: remaining, graceEndsAt: row.graceEndsAt }
}

async function readStoredRow(domainId: string): Promise<MailAccessDomainRow | null> {
  try {
    return await supabaseMailAccessStore.getDomain(domainId)
  } catch {
    return null
  }
}

/** Access status of one of the owner's domains. `userId` and `domainId` come from our own tables. */
export async function resolveMailDomainAccess(
  userId: string,
  domainId: string,
  grants: MailGrants,
  now: Date = new Date(),
): Promise<MailDomainAccess> {
  const deps = defaultMailAccessDeps({ now })
  const row = await readStoredRow(domainId)

  // Platform-owned mail domains are never restricted (same rule as the sync).
  if (row && deps.exemptDomains.has(row.domain.toLowerCase())) {
    return { status: 'active', graceDaysRemaining: null, graceEndsAt: null }
  }

  try {
    const state = computeMailAccess({
      sources: grantsToAccessSources(grants),
      now,
      graceDays: deps.graceDays,
      fallbackEndedAt: row && row.mailAccessStatus !== 'active' ? row.graceStartedAt : null,
    })
    return {
      status: state.status,
      graceDaysRemaining: state.graceDaysRemaining,
      graceEndsAt: state.graceEndsAt ? state.graceEndsAt.toISOString() : null,
    }
  } catch {
    if (row) return accessFromStoredRow(row, now)
    // Without any trustworthy signal, closed is the safe answer.
    return { status: 'suspended', graceDaysRemaining: null, graceEndsAt: null }
  }
}

/** Everything the Email page and the create-mailbox check need, from one read of the owner's grants. */
export async function loadMailLimitContext(
  userId: string,
  domainId: string | null,
  now: Date = new Date(),
): Promise<MailLimitContext> {
  const grants = await loadMailGrants(userId)
  const access: MailDomainAccess = domainId
    ? await resolveMailDomainAccess(userId, domainId, grants, now)
    : { status: 'active', graceDaysRemaining: null, graceEndsAt: null }
  const limit = computeMailboxLimit({ grants, now, countLapsed: access.status !== 'active' })
  return { grants, hasMailSource: hasAnyMailSource(grants), access, limit }
}
