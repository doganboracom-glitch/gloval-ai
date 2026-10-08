import { createAdminClient } from '@/lib/supabase/admin'
import {
  MailError,
  isValidLocalPart,
  type CreateAliasInput,
  type CreateMailboxInput,
  type MailAlias,
  type MailDnsRecordSpec,
  type MailDomain,
  type MailForwarding,
  type MailLogFilter,
  type MailProvider,
  type Mailbox,
  type SetForwardingInput,
  type UpdateMailboxInput,
} from './types'
import { normalizeDestinationAddress, validateAliasDestinations } from './alias-destinations'
import {
  FORWARD_FILTER_TYPE,
  FORWARD_SCRIPT_DESC,
  buildForwardScript,
  filterRowFromApi,
  readForwarding,
  validateForwardingDestinations,
  type FilterRow,
  type ForwardingRead,
} from './forwarding'
import { aliasFromRow, classifyAliasConflict, selectAliasRows } from './alias-mapping'
import { getMailServerHost, getWebmailUrl } from './webmail'

/**
 * Mailcow adapter (https://mailserver.gloval.ai).
 *
 * Facts about the Mailcow API this file depends on:
 *  - Failures come back as HTTP 200 with `{ type: 'danger' | 'error', msg }`,
 *    so `response.ok` alone proves nothing. Every call goes through `unwrap`.
 *  - Quotas are MiB on write and BYTES on read.
 *  - `edit/*` calls take `{ items: [...], attr: {...} }`.
 *  - `delete/mailbox` takes mailbox addresses, `delete/alias` takes numeric ids.
 *  - `get/dkim/<domain>` returns the private key too; it is never exposed here.
 */

const API_URL = process.env.MAILCOW_API_URL?.trim().replace(/\/+$/, '')
const API_KEY = (process.env.MAILCOW_API_KEY || process.env.API_KEY)?.trim()
const MAIL_SERVER_HOST = getMailServerHost()
const DKIM_SELECTOR = 'dkim'
const TIMEOUT_MS = 15_000

// Per-customer-domain limits. `quota` is the domain's total pool in MiB and
// must be at least the sum of its mailboxes, otherwise mailbox creation fails.
const DOMAIN_LIMITS = { aliases: 100, mailboxes: 50, defquota: 1024, maxquota: 10240, quota: 102400 }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertConfigured() {
  if (!API_URL || !API_KEY) throw new Error('Mailcow provider is not configured')
}

type MailcowMessage = { type?: string; msg?: unknown; log?: unknown }

function isFailure(item: unknown): item is MailcowMessage {
  if (!item || typeof item !== 'object') return false
  const type = (item as MailcowMessage).type
  return type === 'danger' || type === 'error'
}

function messageText(item: MailcowMessage): string {
  const msg = Array.isArray(item.msg) ? item.msg.join(' ') : String(item.msg ?? '')
  return msg || 'mailcow_error'
}

async function request<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  assertConfigured()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${API_URL}/api/v1/${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY! },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Mailcow request failed: ${response.status}`)
    const data = (await response.json()) as T
    const items = Array.isArray(data) ? data : [data]
    const failed = items.find(isFailure)
    if (failed) throw new Error(messageText(failed))
    return data
  } finally {
    clearTimeout(timer)
  }
}

function mapError(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (/exist|already|duplicate/i.test(message)) throw new MailError('MAILBOX_EXISTS')
  if (/quota/i.test(message)) throw new MailError('QUOTA_EXCEEDED')
  if (/invalid|syntax/i.test(message)) throw new MailError('INVALID_ADDRESS')
  throw error
}

/**
 * The mail module addresses a customer domain by its custom-domain UUID, the
 * admin screens address it by name. Mailcow only knows names.
 */
async function domainName(domainId: string): Promise<string> {
  if (!UUID_RE.test(domainId)) return domainId.toLowerCase()
  const { data } = await createAdminClient().from('custom_domains').select('domain').eq('id', domainId).maybeSingle()
  const name = (data as { domain?: string } | null)?.domain
  if (!name) throw new MailError('NOT_FOUND')
  return name.toLowerCase()
}

/**
 * `get/filters/<mailbox>` answers with full filter rows. The mailbox id is
 * checked as a single address first because it ends up in the URL path.
 */
async function readMailboxFilters(mailboxId: string): Promise<ForwardingRead> {
  if (normalizeDestinationAddress(mailboxId) !== mailboxId) throw new MailError('NOT_FOUND')
  const raw = await request<unknown>(`get/filters/${encodeURIComponent(mailboxId)}`)
  const rows = (Array.isArray(raw) ? raw : [])
    .map(filterRowFromApi)
    .filter((row): row is FilterRow => row !== null)
  return readForwarding(rows)
}

function forwardingView(read: ForwardingRead): MailForwarding {
  if (read.state === 'none') return { state: 'none' }
  if (read.state === 'unreadable') return { state: 'unreadable' }
  return {
    state: 'forwarding',
    destinations: read.settings.destinations,
    keepCopy: read.settings.keepCopy,
    active: read.active,
  }
}

const mibFromBytes = (bytes: unknown) => Math.round(Number(bytes || 0) / 1048576)

function mailboxFromApi(row: Record<string, unknown>, domainId: string): Mailbox {
  const username = String(row.username || row.email || '')
  const localPart = username.split('@')[0]
  return {
    id: username,
    domainId,
    localPart: localPart || username,
    address: username,
    displayName: String(row.name || localPart || username),
    quotaMb: mibFromBytes(row.quota),
    usedMb: mibFromBytes(row.quota_used),
    status: row.active === 0 || row.active === '0' ? 'suspended' : 'active',
    createdAt: String(row.created || new Date().toISOString()),
  }
}

/**
 * Reads `get/alias/all` (no path suffix: whether Mailcow honours a trailing
 * domain segment on this endpoint is not something this adapter can rely on)
 * and narrows to the domain by address suffix, so the result is the same
 * whichever way Mailcow answers. Mailbox self-rows are removed; inactive
 * aliases and aliases with external destinations are kept.
 */
async function listAliasRows(name: string): Promise<Array<Record<string, unknown>>> {
  const rows = await request<unknown>('get/alias/all')
  return selectAliasRows(rows, name)
}

/** Mailcow's add/alias answers `{ msg: ['alias_added', address, id] }`; the id is the third entry. */
function createdAliasId(response: unknown): string | null {
  const first = Array.isArray(response) ? response[0] : response
  const msg = first && typeof first === 'object' ? (first as MailcowMessage).msg : null
  return Array.isArray(msg) && msg[2] !== undefined && msg[2] !== null ? String(msg[2]) : null
}

async function getDkim(name: string): Promise<{ selector: string; txt: string } | null> {
  const data = await request<Record<string, unknown>>(`get/dkim/${encodeURIComponent(name)}`)
  if (!data || typeof data.dkim_txt !== 'string' || !data.dkim_txt) return null
  return { selector: String(data.dkim_selector || DKIM_SELECTOR), txt: data.dkim_txt }
}

export const mailcowProvider: MailProvider = {
  id: 'mailcow',

  async listDomains(userId = '') {
    const rows = await request<Array<Record<string, unknown>>>('get/domain/all')
    return (Array.isArray(rows) ? rows : []).map((row): MailDomain => {
      const name = String(row.domain_name || row.domain)
      return {
        id: name,
        userId,
        domain: name,
        status: row.active === 0 || row.active === '0' ? 'failed' : 'active',
        dns: [],
        createdAt: String(row.created || new Date().toISOString()),
      }
    })
  },

  async getDomain(domainId) {
    const name = await domainName(domainId)
    return (await this.listDomains()).find((d) => d.domain === name) || null
  },

  async verifyDomain(domainId) {
    const domain = await this.getDomain(domainId)
    if (!domain) throw new MailError('NOT_FOUND')
    return domain
  },

  /** Idempotent: adds the domain and its DKIM key only when missing. */
  async ensureDomain(domain) {
    const name = domain.domain.toLowerCase()
    const existing = await request<Record<string, unknown>>(`get/domain/${encodeURIComponent(name)}`)
    if (!existing || !existing.domain_name) {
      await request('add/domain', {
        body: { domain: name, description: 'GLOVAL Mail', active: 1, restart_sogo: 1, ...DOMAIN_LIMITS },
      })
    }
    if (!(await getDkim(name))) {
      await request('add/dkim', { body: { domains: name, dkim_selector: DKIM_SELECTOR, key_size: 2048 } })
    }
    return domain
  },

  async dnsRecords(domain: string): Promise<MailDnsRecordSpec[]> {
    const name = domain.toLowerCase()
    const dkim = await getDkim(name)
    if (!dkim) return []
    return [
      { type: 'MX', host: '@', value: MAIL_SERVER_HOST, priority: 10 },
      { type: 'TXT', host: '@', value: 'v=spf1 mx ~all', label: 'SPF' },
      { type: 'TXT', host: `${dkim.selector}._domainkey`, value: dkim.txt, label: 'DKIM' },
      { type: 'TXT', host: '_dmarc', value: `v=DMARC1; p=quarantine; adkim=r; aspf=r`, label: 'DMARC' },
    ]
  },

  async listMailboxes(domainId) {
    const name = await domainName(domainId)
    const rows = await request<Array<Record<string, unknown>>>(`get/mailbox/all/${encodeURIComponent(name)}`)
    return (Array.isArray(rows) ? rows : []).map((row) => mailboxFromApi(row, domainId))
  },

  async createMailbox(input: CreateMailboxInput) {
    const localPart = input.localPart.trim().toLowerCase()
    if (!isValidLocalPart(localPart)) throw new MailError('INVALID_ADDRESS')
    const name = await domainName(input.domainId)
    try {
      await request('add/mailbox', {
        body: {
          local_part: localPart,
          domain: name,
          name: input.displayName.trim(),
          quota: String(input.quotaMb), // MiB
          password: input.password,
          password2: input.password,
          active: '1',
          force_pw_update: '0',
          tls_enforce_in: '0',
          tls_enforce_out: '0',
        },
      })
    } catch (error) {
      return mapError(error)
    }
    const created = (await this.listMailboxes(input.domainId)).find((box) => box.localPart === localPart)
    if (!created) throw new MailError('NOT_FOUND')
    return created
  },

  async updateMailbox(id: string, input: UpdateMailboxInput) {
    const attr: Record<string, string> = {}
    if (input.displayName !== undefined) attr.name = input.displayName.trim()
    if (input.quotaMb !== undefined) attr.quota = String(input.quotaMb)
    if (input.status !== undefined) attr.active = input.status === 'suspended' ? '0' : '1'
    if (Object.keys(attr).length > 0) await request('edit/mailbox', { body: { items: [id], attr } })
    const updated = (await this.listMailboxes(id.split('@')[1])).find((box) => box.id === id)
    if (!updated) throw new MailError('NOT_FOUND')
    return updated
  },

  async deleteMailbox(id) {
    await request('delete/mailbox', { body: [id] })
  },

  async setPassword(id, password) {
    try {
      await request('edit/mailbox', { body: { items: [id], attr: { password, password2: password } } })
    } catch {
      // Drop the original error: only a fixed code leaves this adapter, so no
      // Mailcow text (or anything derived from the request) can reach logs or the UI.
      throw new MailError('PASSWORD_UPDATE_FAILED')
    }
  },

  async setMailboxAccess(id, enabled) {
    if (normalizeDestinationAddress(String(id ?? '')) !== id) throw new Error('mail_access_update_failed')
    const flag = enabled ? '1' : '0'
    try {
      await request('edit/mailbox', {
        body: { items: [id], attr: { imap_access: flag, pop3_access: flag, smtp_access: flag, sogo_access: flag } },
      })
    } catch {
      // Fixed code only: Mailcow's own text never reaches logs or stored state.
      throw new Error('mail_access_update_failed')
    }
  },

  async setMailboxActive(id, active) {
    if (normalizeDestinationAddress(String(id ?? '')) !== id) throw new Error('mail_access_update_failed')
    try {
      await request('edit/mailbox', { body: { items: [id], attr: { active: active ? '1' : '0' } } })
    } catch {
      throw new Error('mail_access_update_failed')
    }
  },

  async setDomainActive(domainId, active) {
    try {
      const name = await domainName(domainId)
      await request('edit/domain', { body: { items: [name], attr: { active: active ? '1' : '0' } } })
    } catch (error) {
      if (error instanceof MailError) throw error
      throw new Error('mail_access_update_failed')
    }
  },

  async listAliases(domainId) {
    const name = await domainName(domainId)
    return (await listAliasRows(name)).map((row) => aliasFromRow(row, domainId))
  },

  async createAlias(input: CreateAliasInput) {
    const name = await domainName(input.domainId)
    const localPart = String(input.localPart ?? '').trim().toLowerCase()
    if (!isValidLocalPart(localPart)) throw new MailError('INVALID_ADDRESS')
    const address = `${localPart}@${name}`

    // Format-only check here (the server action owns the "belongs to this
    // customer" check). It also rebuilds `goto` from validated single addresses,
    // so no caller can inject extra comma-separated destinations.
    const checked = validateAliasDestinations({
      aliasAddress: address,
      domain: name,
      destinations: input.destinations,
      internalAddresses: null,
    })
    if (!checked.ok) throw new MailError(checked.code)

    let response: unknown
    try {
      response = await request('add/alias', {
        body: { address, goto: checked.destinations.join(','), active: '1', sogo_visible: '1' },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      // Mailcow says "object_exists" for a mailbox and for an alias alike; the
      // live lists decide which one the customer is told about.
      const [mailboxes, aliasRows] = await Promise.all([
        this.listMailboxes(input.domainId).catch(() => []),
        listAliasRows(name).catch(() => []),
      ])
      const code = classifyAliasConflict({
        message,
        address,
        mailboxAddresses: mailboxes.map((box) => box.address),
        aliasAddresses: aliasRows.map((row) => String(row.address)),
      })
      if (code) throw new MailError(code)
      throw error
    }

    // The alias exists on the server at this point. If the follow-up read does
    // not return it, answer from what was just written instead of reporting a
    // failure for something that succeeded.
    const created = (await listAliasRows(name)).find((row) => String(row.address).toLowerCase() === address)
    if (created) return aliasFromRow(created, input.domainId)
    return {
      id: createdAliasId(response) ?? address,
      domainId: input.domainId,
      address,
      destinations: checked.destinations,
      active: true,
      createdAt: new Date().toISOString(),
    }
  },

  async deleteAlias(id) {
    await request('delete/alias', { body: [id] })
  },

  async setAliasActive(id, active) {
    await request('edit/alias', { body: { items: [id], attr: { active: active ? '1' : '0' } } })
  },

  async getMailboxForwarding(mailboxId) {
    return forwardingView(await readMailboxFilters(mailboxId))
  },

  async setMailboxForwarding(mailboxId: string, input: SetForwardingInput) {
    const mailboxAddress = String(mailboxId ?? '')
    if (normalizeDestinationAddress(mailboxAddress) !== mailboxAddress) throw new MailError('NOT_FOUND')

    // Format-only check; the server action owns "belongs to this customer".
    const checked = validateForwardingDestinations({
      mailboxAddress,
      domain: mailboxAddress.split('@')[1],
      destinations: input.destinations,
      internalAddresses: null,
    })
    if (!checked.ok) throw new MailError(checked.code)

    const before = await readMailboxFilters(mailboxAddress)
    if (before.state === 'unreadable' && input.overwriteUnreadable !== true) {
      throw new MailError('FORWARD_UNREADABLE')
    }

    try {
      if (checked.destinations.length === 0) {
        if (before.owned.length > 0) await request('delete/filter', { body: before.owned.map((row) => row.id) })
        return { state: 'none' }
      }

      // Mailcow keeps one active filter per mailbox and type, so turning ours
      // on would silently turn the customer's own postfilter off.
      if (before.blocker) throw new MailError('FORWARD_FILTER_CONFLICT')

      const scriptData = buildForwardScript(checked.destinations, input.keepCopy === true)
      const [primary, ...extras] = [...before.owned].sort((a, b) => Number(b.active) - Number(a.active))

      if (primary) {
        await request('edit/filter', {
          body: {
            items: [primary.id],
            attr: {
              active: '1',
              script_desc: FORWARD_SCRIPT_DESC,
              script_data: scriptData,
              filter_type: FORWARD_FILTER_TYPE,
            },
          },
        })
        if (extras.length > 0) await request('delete/filter', { body: extras.map((row) => row.id) })
      } else {
        await request('add/filter', {
          body: {
            username: mailboxAddress,
            active: '1',
            script_desc: FORWARD_SCRIPT_DESC,
            script_data: scriptData,
            filter_type: FORWARD_FILTER_TYPE,
          },
        })
      }

      // Mailcow reports a rejected script as a normal 200 response, so trust the
      // stored result rather than the write.
      const after = forwardingView(await readMailboxFilters(mailboxAddress))
      const wanted = [...checked.destinations].sort().join(',')
      const stored = after.state === 'forwarding' && after.active ? [...after.destinations].sort().join(',') : null
      if (stored !== wanted) throw new MailError('FORWARD_UPDATE_FAILED')
      return after
    } catch (error) {
      if (error instanceof MailError) throw error
      // Never forward Mailcow's own message: it can echo the script or request.
      throw new MailError('FORWARD_UPDATE_FAILED')
    }
  },

  async listForwardings(mailboxIds) {
    const entries = await Promise.all(
      mailboxIds.map(async (id) => {
        try {
          return [id, forwardingView(await readMailboxFilters(id))] as const
        } catch {
          return null
        }
      }),
    )
    const result: Record<string, MailForwarding> = {}
    for (const entry of entries) {
      if (entry && entry[1].state !== 'none') result[entry[0]] = entry[1]
    }
    return result
  },

  async listLogs(_filter: MailLogFilter) {
    return []
  },

  webmailUrl() {
    return getWebmailUrl()
  },
}

export function isMailcowConfigured() {
  return Boolean(API_URL && API_KEY)
}
