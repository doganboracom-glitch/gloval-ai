import {
  MailError,
  isValidLocalPart,
  type CreateAliasInput,
  type CreateMailboxInput,
  type MailAlias,
  type MailDomain,
  type MailLogFilter,
  type MailProvider,
  type Mailbox,
  type UpdateMailboxInput,
} from './types'

const API_URL = process.env.MAILCOW_API_URL?.replace(/\/$/, '')
const API_KEY = (process.env.MAILCOW_API_KEY || process.env.API_KEY)?.trim()
const MAIL_SERVER_HOST = process.env.MAIL_SERVER_HOST?.trim() || 'mailserver.gloval.ai'

function configured() {
  if (!API_URL || !API_KEY) throw new Error('Mailcow provider is not configured')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  configured()
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY!,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Mailcow request failed: ${response.status}`)
  const body = (await response.json()) as unknown
  // Mailcow answers HTTP 200 even for rejected writes; the verdict is in the body.
  const entries = Array.isArray(body) ? body : [body]
  const rejected = entries.find(
    (entry): entry is { type: string; msg?: unknown } =>
      typeof entry === 'object' && entry !== null && (entry as { type?: unknown }).type === 'danger',
  )
  if (rejected) throw new Error(`Mailcow rejected request: ${String(rejected.msg ?? '')}`)
  return body as T
}

/**
 * Mailcow returns `{}` instead of `[]` when a list endpoint has no rows
 * (e.g. a domain with no mailboxes or aliases yet), so never `.map` the raw body.
 */
function asRows(body: unknown): Array<Record<string, unknown>> {
  return Array.isArray(body) ? (body as Array<Record<string, unknown>>) : []
}

function mapError(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (/already|exist|duplicate/i.test(message)) throw new MailError('MAILBOX_EXISTS')
  throw error
}

function domainFromName(name: string, userId = ''): MailDomain {
  return {
    id: name,
    userId,
    domain: name,
    status: 'active',
    dns: [],
    createdAt: new Date().toISOString(),
  }
}

function mailboxFromApi(row: Record<string, unknown>, domainId: string): Mailbox {
  const username = String(row.username || row.email || '')
  const [localPart, domain] = username.split('@')
  return {
    id: username,
    domainId,
    localPart: localPart || username,
    address: username,
    displayName: String(row.name || row.display_name || localPart || username),
    quotaMb: Number(row.quota || row.quota_mb || 0),
    usedMb: Number(row.quota_used || row.used_mb || 0),
    status: row.active === 0 || row.active === '0' ? 'suspended' : 'active',
    createdAt: String(row.created || new Date().toISOString()),
  }
}

export const mailcowProvider: MailProvider = {
  id: 'mailcow',

  async listDomains(userId) {
    const rows = asRows(await request<unknown>('/api/v1/get/domain/all'))
    return rows.map((row) => domainFromName(String(row.domain_name || row.domain), userId))
  },

  async getDomain(domainId) {
    const domains = await this.listDomains()
    return domains.find((domain) => domain.id === domainId) || null
  },

  async verifyDomain(domainId) {
    const domain = await this.getDomain(domainId)
    if (!domain) throw new MailError('NOT_FOUND')
    return domain
  },

  async ensureDomain(domain) {
    try {
      await request('/api/v1/add/domain', {
        method: 'POST',
        body: JSON.stringify({ domain: domain.domain, description: 'GLOVAL Mail', aliases: 100, mailboxes: 100, quota: 10, active: 1 }),
      })
    } catch (error) {
      if (!/already|exist|duplicate/i.test(error instanceof Error ? error.message : '')) throw error
    }
    // Mailcow addresses a domain by hostname, not by the custom-domain registry's
    // UUID, so from here on the hostname is the id every mailbox/alias call uses.
    return { ...domain, id: domain.domain }
  },

  async listMailboxes(domainId) {
    const rows = asRows(await request<unknown>(`/api/v1/get/mailbox/all/${encodeURIComponent(domainId)}`))
    return rows.map((row) => mailboxFromApi(row, domainId))
  },

  async createMailbox(input: CreateMailboxInput) {
    const localPart = input.localPart.trim().toLowerCase()
    if (!isValidLocalPart(localPart)) throw new MailError('INVALID_ADDRESS')
    try {
      await request('/api/v1/add/mailbox', {
        method: 'POST',
        body: JSON.stringify({ local_part: localPart, domain: input.domainId, name: input.displayName.trim(), quota: Math.ceil(input.quotaMb / 1024), password: crypto.randomUUID() + 'Aa1!' }),
      })
      const boxes = await this.listMailboxes(input.domainId)
      const created = boxes.find((box) => box.localPart === localPart)
      if (!created) throw new MailError('NOT_FOUND')
      return created
    } catch (error) { return mapError(error) }
  },

  async updateMailbox(id: string, input: UpdateMailboxInput) {
    await request('/api/v1/edit/mailbox', { method: 'POST', body: JSON.stringify({ username: id, name: input.displayName, active: input.status === 'suspended' ? 0 : 1 }) })
    const domain = id.split('@')[1]
    const boxes = await this.listMailboxes(domain)
    const updated = boxes.find((box) => box.id === id)
    if (!updated) throw new MailError('NOT_FOUND')
    return updated
  },

  async deleteMailbox(id) {
    await request('/api/v1/delete/mailbox', { method: 'POST', body: JSON.stringify({ items: [id] }) })
  },

  async resetPassword(id) {
    const password = `${crypto.randomUUID()}Aa1!`
    await request('/api/v1/edit/mailbox', { method: 'POST', body: JSON.stringify({ username: id, password }) })
    return { tempPassword: password }
  },

  async listAliases(domainId) {
    const rows = asRows(await request<unknown>(`/api/v1/get/alias/all/${encodeURIComponent(domainId)}`))
    return rows.map((row) => ({ id: String(row.address), domainId, address: String(row.address), destinations: Array.isArray(row.goto) ? row.goto.map(String) : String(row.goto || '').split(',').filter(Boolean), createdAt: new Date().toISOString() }))
  },

  async createAlias(input: CreateAliasInput) {
    const address = `${input.localPart.trim().toLowerCase()}@${input.domainId}`
    await request('/api/v1/add/alias', { method: 'POST', body: JSON.stringify({ address, goto: input.destinations.join(','), active: 1 }) })
    return { id: address, domainId: input.domainId, address, destinations: input.destinations, createdAt: new Date().toISOString() }
  },

  async deleteAlias(id) { await request('/api/v1/delete/alias', { method: 'POST', body: JSON.stringify({ items: [id] }) }) },
  async listLogs(_filter: MailLogFilter) { return [] },
  webmailUrl(address) { return `https://${MAIL_SERVER_HOST}/SOGo/?user=${encodeURIComponent(address)}` },
}

export function isMailcowConfigured() { return Boolean(API_URL && API_KEY) }


