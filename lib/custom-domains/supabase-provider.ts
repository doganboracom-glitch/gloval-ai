import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { placeholderDns } from './mock-provider'
import {
  buildDnsRecords,
  checkOwnership,
  dohResolver,
  newVerificationToken,
  probeHttps,
  mergeWithPrevious,
  runConnectionCheck,
  type ConnectionDeps,
} from './connection'
import { normalizeDomain } from './normalize'
import { pageRange } from './pagination'
import { getVercelClient } from './vercel'
import {
  DomainError,
  domainSourceFromProvider,
  emailRecordKey,
  EMPTY_CONNECTION,
  isHostingAttachAllowed,
  type AddDomainInput,
  type CustomDomain,
  type DnsRecord,
  type DomainProvider,
  type DomainStatus,
  type DnsStage,
  type SslStage,
  type VercelStage,
} from './types'

/**
 * Persistent domain registry backed by `public.custom_domains`.
 *
 * Uses the service-role client: customers only have SELECT on the table (see
 * scripts/014-custom-domains.sql), and every caller in `actions.ts` performs the
 * ownership check before reaching this layer.
 *
 * Honesty rules:
 *  - A row becomes `active` (ownership proven) only via a real TXT lookup of
 *    its per-domain random token, or the registrar purchase flow where the
 *    platform itself registered the domain.
 *  - `active` is NOT "live". Whether the site is reachable is the separate
 *    dns / vercel / ssl connection stages (see `isDomainLive`).
 */

type Row = {
  id: string
  user_id: string
  domain: string
  status: DomainStatus
  is_primary: boolean
  dns: DnsRecord[] | null
  website_project_id: string | null
  email_enabled: boolean
  verified_at: string | null
  created_at: string
  verification_token: string | null
  dns_status: DnsStage | null
  vercel_status: VercelStage | null
  ssl_status: SslStage | null
  last_checked_at: string | null
  last_error: string | null
  provider: string | null
  expires_at: string | null
}

const COLUMNS =
  'id, user_id, domain, status, is_primary, dns, website_project_id, email_enabled, verified_at, created_at, verification_token, dns_status, vercel_status, ssl_status, last_checked_at, last_error, provider, expires_at'

/** At or below PostgREST's default max-rows, so a chunk is never cut short. */
const LIST_CHUNK = 1000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toDomain(row: Row): CustomDomain {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    status: row.status,
    isPrimary: row.is_primary,
    dns: row.dns ?? [],
    websiteProjectId: row.website_project_id,
    emailEnabled: row.email_enabled,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    connection: {
      ...EMPTY_CONNECTION,
      dns: row.dns_status ?? 'pending',
      vercel: row.vercel_status ?? 'not_configured',
      ssl: row.ssl_status ?? 'pending',
      lastCheckedAt: row.last_checked_at,
      lastError: row.last_error,
      // NULL ssl_status on an ACTIVE row = it was already serving before migration
      // 016 and keeps doing so. A non-active row is never legacy: when it is later
      // promoted, verifyOwnership initialises its stages so it must earn "live".
      legacy: row.ssl_status === null && row.status === 'active',
    },
    mock: false,
    source: domainSourceFromProvider(row.provider),
    expiresAt: row.expires_at,
  }
}

type PgError = { code?: string; message?: string } | null

export class SupabaseDomainProvider implements DomainProvider {
  readonly id = 'supabase'
  readonly verifiesForReal = true

  constructor(private readonly client?: SupabaseClient) {}

  private db(): SupabaseClient {
    return this.client ?? createAdminClient()
  }

  /**
   * Reads every row. PostgREST silently truncates one response at the project's
   * max-rows setting (1000 by default), so this walks the result in chunks
   * instead of trusting a single request. The `id` tie-breaker keeps the order
   * total, otherwise rows can repeat or vanish across chunk boundaries.
   */
  async listDomains(userId?: string): Promise<CustomDomain[]> {
    const rows: Row[] = []
    for (let from = 0; ; from += LIST_CHUNK) {
      let query = this.db().from('custom_domains').select(COLUMNS)
      if (userId) query = query.eq('user_id', userId)
      const { data, error } = await query
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + LIST_CHUNK - 1)
      if (error) throw error
      const chunk = (data ?? []) as Row[]
      rows.push(...chunk)
      if (chunk.length < LIST_CHUNK) break
    }
    return rows.map(toDomain)
  }

  async listDomainsPage(
    userId: string,
    request: { page: number; pageSize: number },
  ): Promise<{ items: CustomDomain[]; total: number }> {
    const { from, to } = pageRange(request.page, request.pageSize)
    const { data, error, count } = await this.db()
      .from('custom_domains')
      .select(COLUMNS, { count: 'exact' })
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    if (error) throw error
    return { items: ((data ?? []) as Row[]).map(toDomain), total: count ?? 0 }
  }

  async getDomain(domainId: string): Promise<CustomDomain | null> {
    if (!UUID_RE.test(domainId)) return null
    const { data, error } = await this.db()
      .from('custom_domains')
      .select(COLUMNS)
      .eq('id', domainId)
      .maybeSingle()
    if (error) throw error
    return data ? toDomain(data as Row) : null
  }

  async findActiveByHost(host: string): Promise<CustomDomain | null> {
    const { data, error } = await this.db()
      .from('custom_domains')
      .select(COLUMNS)
      .eq('domain', host)
      .eq('status', 'active')
      .not('website_project_id', 'is', null)
      .maybeSingle()
    if (error) throw error
    return data ? toDomain(data as Row) : null
  }

  async findActiveByHostname(domain: string): Promise<CustomDomain | null> {
    const { data, error } = await this.db()
      .from('custom_domains')
      .select(COLUMNS)
      .eq('domain', domain)
      .eq('status', 'active')
      .maybeSingle()
    if (error) throw error
    return data ? toDomain(data as Row) : null
  }

  async syncConnection(domainId: string): Promise<CustomDomain> {
    const current = await this.getDomain(domainId)
    if (!current) throw new DomainError('NOT_FOUND')
    return this.refreshConnection(current)
  }

  async addDomain({ userId, domain, registered, websiteProjectId }: AddDomainInput): Promise<CustomDomain> {
    const db = this.db()

    if (registered) {
      const { data: byOrder } = await db
        .from('custom_domains')
        .select(COLUMNS)
        .eq('order_id', registered.orderId)
        .maybeSingle()
      if (byOrder) return toDomain(byOrder as Row)
    }

    const { count } = await db
      .from('custom_domains')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_primary', true)

    const token = newVerificationToken()
    const dns = buildDnsRecords({
      domain,
      token,
      existing: placeholderDns(domain),
      ownershipVerified: Boolean(registered),
    })

    const insert = (isPrimary: boolean) =>
      db
        .from('custom_domains')
        .insert({
          user_id: userId,
          domain,
          status: registered ? 'active' : 'pending',
          is_primary: isPrimary,
          provider: registered ? 'domainnameapi' : 'supabase',
          dns,
          verification_token: token,
          website_project_id: websiteProjectId ?? null,
          order_id: registered?.orderId ?? null,
          expires_at: registered?.expiresAt ?? null,
          verified_at: registered ? new Date().toISOString() : null,
        })
        .select(COLUMNS)
        .single()

    let { data, error } = await insert((count ?? 0) === 0)

    // Lost a race for the primary slot: retry as non-primary.
    if (error?.code === '23505' && error.message?.includes('one_primary_per_user')) {
      ;({ data, error } = await insert(false))
    }

    if (error) {
      if (error.code === '23505') {
        // Same order raced us: return the winner. Otherwise the hostname is taken.
        if (registered) {
          const { data: existing } = await db
            .from('custom_domains')
            .select(COLUMNS)
            .eq('order_id', registered.orderId)
            .maybeSingle()
          if (existing) return toDomain(existing as Row)
        }
        throw new DomainError('DOMAIN_EXISTS')
      }
      throw error
    }
    return toDomain(data as Row)
  }

  async removeDomain(domainId: string): Promise<void> {
    const existing = await this.getDomain(domainId)
    if (!existing) throw new DomainError('NOT_FOUND')

    const db = this.db()

    // Detach from Vercel BEFORE deleting the row, and only if we attached it, so
    // we never touch a hostname that was never ours, that belongs to the platform,
    // or that another active row still claims. If Vercel refuses, the row is kept
    // (with the reason recorded) so the delete can simply be retried; a 404 from
    // Vercel counts as already detached, which makes the retry converge.
    const vercel = getVercelClient()
    const normalized = normalizeDomain(existing.domain)
    // A row is attached from the moment it is added (not only once ownership is
    // proven), so a pending row that reached Vercel must be detached too.
    const attachedByUs =
      vercel.configured &&
      !existing.connection.legacy &&
      existing.connection.vercel !== 'not_configured' &&
      normalized.ok &&
      normalized.domain === existing.domain
    if (attachedByUs) {
      const { count, error: countError } = await db
        .from('custom_domains')
        .select('id', { count: 'exact', head: true })
        .eq('domain', existing.domain)
        .or('status.eq.active,vercel_status.neq.not_configured')
        .neq('id', existing.id)
      if (countError) throw countError
      if ((count ?? 0) === 0) {
        for (const host of [`www.${existing.domain}`, existing.domain]) {
          const detached = await vercel.removeDomain(host)
          if (!detached.ok) {
            await db
              .from('custom_domains')
              .update({ last_error: `detach_failed:${detached.code}` })
              .eq('id', existing.id)
            throw new DomainError('VERCEL_DETACH_FAILED')
          }
        }
      }
    }

    const { error } = await db.from('custom_domains').delete().eq('id', domainId)
    if (error) throw error

    // Never leave a user with domains but no primary.
    if (existing.isPrimary) {
      const remaining = await this.listDomains(existing.userId)
      if (remaining[0]) {
        await db.from('custom_domains').update({ is_primary: true }).eq('id', remaining[0].id)
      }
    }
  }

  async startVerification(domainId: string): Promise<CustomDomain> {
    const current = await this.getDomain(domainId)
    if (!current) throw new DomainError('NOT_FOUND')
    if (current.source !== 'external') throw new DomainError('FORBIDDEN')
    // Only a never-started domain is promoted; verified/failed/disabled rows are returned untouched.
    if (current.status !== 'pending') return current

    const db = this.db()
    const { data: tokenRow } = await db
      .from('custom_domains')
      .select('verification_token')
      .eq('id', current.id)
      .maybeSingle()
    const existingToken = (tokenRow as { verification_token: string | null } | null)?.verification_token ?? null
    const token = existingToken ?? newVerificationToken()

    const patch: Record<string, unknown> = { status: 'verifying' }
    if (!existingToken) patch.verification_token = token
    const hasOwnershipRecord = current.dns.some(
      (r) => r.type === 'TXT' && r.purpose === 'verification' && r.value.endsWith(token),
    )
    if (!hasOwnershipRecord) {
      patch.dns = buildDnsRecords({ domain: current.domain, token, existing: current.dns, ownershipVerified: false })
    }

    // Compare-and-set on `pending` so a concurrent start/verify is never overwritten.
    const { data, error } = await db
      .from('custom_domains')
      .update(patch)
      .eq('id', current.id)
      .eq('status', 'pending')
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) return (await this.getDomain(current.id)) ?? current

    // Best effort: pull the hosting provider's own challenge records so they are
    // listed together with the ownership TXT. A hosting failure must not undo the start.
    const started = toDomain(data as Row)
    return this.refreshConnection(started).catch(() => started)
  }

  async verifyDomain(domainId: string): Promise<CustomDomain> {
    let current = await this.getDomain(domainId)
    if (!current) throw new DomainError('NOT_FOUND')

    if (current.status !== 'active') {
      // Fetch the Vercel records first: verifyOwnership throws while the TXT is
      // still missing, and the customer must still see up-to-date records (and
      // any Vercel error) after pressing "check".
      current = await this.refreshConnection(current).catch(() => current as CustomDomain)
      current = await this.verifyOwnership(current)
    }
    return this.refreshConnection(current)
  }

  /** TXT ownership step. Throws DNS_VERIFICATION_UNAVAILABLE until the record resolves. */
  private async verifyOwnership(existing: CustomDomain): Promise<CustomDomain> {
    const db = this.db()
    const { data: tokenRow } = await db
      .from('custom_domains')
      .select('verification_token')
      .eq('id', existing.id)
      .maybeSingle()
    let token = (tokenRow as { verification_token: string | null } | null)?.verification_token ?? null

    // Legacy pending row: its old record was a guessable placeholder. Issue a
    // real random token and ask the customer to publish it.
    if (!token) {
      token = newVerificationToken()
      await db
        .from('custom_domains')
        .update({
          verification_token: token,
          dns: buildDnsRecords({ domain: existing.domain, token, existing: existing.dns, ownershipVerified: false }),
        })
        .eq('id', existing.id)
      throw new DomainError('DNS_VERIFICATION_UNAVAILABLE')
    }

    const record = existing.dns.find((r) => r.type === 'TXT' && r.purpose === 'verification' && r.value.endsWith(token!))
    const lookup = record ? await checkOwnership(existing.domain, record, dohResolver) : 'missing'

    // A resolver outage proves nothing about the record: leave the row untouched.
    if (lookup === 'unavailable') throw new DomainError('TEMPORARY_FAILURE')
    const verified = lookup === 'verified'

    const patch: Record<string, unknown> = {
      status: verified ? 'active' : 'failed',
      dns: existing.dns.map((r) => (r === record ? { ...r, verified, placeholder: false } : r)),
      verified_at: verified ? new Date().toISOString() : null,
    }
    // A row being promoted now was never serving, so it is never "legacy": give it
    // explicit pending stages so it must pass DNS/Vercel/SSL before going live.
    if (verified) {
      patch.dns_status = 'pending'
      patch.vercel_status = 'not_configured'
      patch.ssl_status = 'pending'
    }

    // Only promote/fail rows that are still not active, so concurrent verify
    // requests cannot reset stages another request already advanced.
    const { data, error } = await db
      .from('custom_domains')
      .update(patch)
      .eq('id', existing.id)
      .neq('status', 'active')
      .select(COLUMNS)
      .maybeSingle()

    if (error) {
      // Two users can verify the same hostname at once; the partial active
      // unique index lets only one promotion win.
      if (error.code === '23505') throw new DomainError('DOMAIN_EXISTS')
      throw error
    }
    if (!data) {
      const current = await this.getDomain(existing.id)
      if (!current) throw new DomainError('NOT_FOUND')
      return current
    }
    if (!verified) throw new DomainError('DNS_VERIFICATION_UNAVAILABLE')
    return toDomain(data as Row)
  }

  private connectionDeps(): ConnectionDeps {
    return { vercel: getVercelClient(), resolver: dohResolver, probe: probeHttps, now: () => new Date() }
  }

  /** Runs Vercel attach + DNS + SSL checks for an ownership-verified domain and persists the result. */
  async refreshConnection(domain: CustomDomain): Promise<CustomDomain> {
    // A domain bought through GLOVAL is only attached to hosting once the owner
    // has picked a project ("Projeye senkronize et"). Until then it is registered
    // but deliberately not wired to any Vercel project, whichever path got us
    // here (cron, detail page, verify, purchase finalization).
    if (!isHostingAttachAllowed(domain)) return domain
    const ownershipVerified = domain.status === 'active'
    const db = this.db()
    const { data: tokenRow } = await db
      .from('custom_domains')
      .select('verification_token')
      .eq('id', domain.id)
      .maybeSingle()
    const token = (tokenRow as { verification_token: string | null } | null)?.verification_token
    if (!token) return domain

    const result = await runConnectionCheck(
      {
        domain: domain.domain,
        token,
        dns: domain.dns,
        legacy: domain.connection.legacy,
        ownershipVerified,
      },
      this.connectionDeps(),
    )
    const c = mergeWithPrevious(domain.connection, result)

    const patch: Record<string, unknown> = {
      dns: result.dns,
      last_checked_at: c.lastCheckedAt,
      last_error: c.lastError,
    }
    // A legacy row stays legacy (NULL stages) while Vercel is not configured here.
    if (!c.legacy) {
      patch.dns_status = c.dns
      patch.vercel_status = c.vercel
      patch.ssl_status = c.ssl
      patch.vercel_verification = result.vercelChallenges.length ? result.vercelChallenges : null
    }

    // Compare-and-set on last_checked_at: if another request refreshed this row
    // while our (slow) checks ran, keep its result instead of overwriting it.
    let update = db.from('custom_domains').update(patch).eq('id', domain.id).eq('status', domain.status)
    update = domain.connection.lastCheckedAt
      ? update.eq('last_checked_at', domain.connection.lastCheckedAt)
      : update.is('last_checked_at', null)
    const { data, error } = await update.select(COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) return (await this.getDomain(domain.id)) ?? domain
    return toDomain(data as Row)
  }

  /**
   * Domains whose ownership is proven but that are not yet fully live; used by the cron.
   * Bounded by `limit` and a wall-clock `budgetMs` so a slow provider cannot push
   * the function past its time limit; the oldest-checked rows go first, so the
   * rest are picked up on the next run.
   */
  async refreshPendingConnections(limit = 25, budgetMs = 40_000): Promise<number> {
    const deadline = Date.now() + budgetMs
    const { data, error } = await this.db()
      .from('custom_domains')
      .select(COLUMNS)
      .eq('status', 'active')
      .not('ssl_status', 'is', null)
      .neq('ssl_status', 'ready')
      // Purchased domains with no chosen project must never be auto-attached.
      .or('website_project_id.not.is.null,provider.neq.domainnameapi')
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(limit)
    if (error) throw error
    let refreshed = 0
    for (const row of (data ?? []) as Row[]) {
      if (Date.now() >= deadline) break
      try {
        await this.refreshConnection(toDomain(row))
        refreshed += 1
      } catch (err) {
        console.log('[v0] refreshConnection failed:', row.domain, err)
      }
    }
    return refreshed
  }

  async setPrimary(userId: string, domainId: string): Promise<CustomDomain[]> {
    const target = await this.getDomain(domainId)
    if (!target || target.userId !== userId) throw new DomainError('NOT_FOUND')

    const db = this.db()
    // Unset first so the partial unique index never sees two primaries.
    const unset = await db
      .from('custom_domains')
      .update({ is_primary: false })
      .eq('user_id', userId)
      .neq('id', domainId)
    if (unset.error) throw unset.error
    const set = await db.from('custom_domains').update({ is_primary: true }).eq('id', domainId)
    if (set.error) throw set.error

    return this.listDomains(userId)
  }

  async setWebsiteProject(domainId: string, projectId: string | null): Promise<CustomDomain> {
    if (!UUID_RE.test(domainId)) throw new DomainError('NOT_FOUND')
    const { data, error } = (await this.db()
      .from('custom_domains')
      .update({ website_project_id: projectId })
      .eq('id', domainId)
      .select(COLUMNS)
      .maybeSingle()) as { data: Row | null; error: PgError }
    if (error) throw error
  if (!data) throw new DomainError('NOT_FOUND')
  return toDomain(data)
  }

  async saveEmailDnsVerification(domainId: string, checked: DnsRecord[]): Promise<CustomDomain> {
  if (!UUID_RE.test(domainId)) throw new DomainError('NOT_FOUND')
  const current = await this.getDomain(domainId)
  if (!current) throw new DomainError('NOT_FOUND')

  const flags = new Map(checked.filter((r) => r.purpose === 'email').map((r) => [emailRecordKey(r), r.verified]))
  const dns = current.dns.map((r) =>
  r.purpose === 'email' ? { ...r, verified: r.placeholder ? false : (flags.get(emailRecordKey(r)) ?? r.verified) } : r,
  )

  const { data, error } = (await this.db()
  .from('custom_domains')
  .update({ dns })
  .eq('id', domainId)
  .select(COLUMNS)
  .maybeSingle()) as { data: Row | null; error: PgError }
  if (error) throw error
  if (!data) throw new DomainError('NOT_FOUND')
  return toDomain(data)
  }
  }
