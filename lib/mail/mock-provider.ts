import {
  MailError,
  isValidLocalPart,
  type CreateAliasInput,
  type CreateMailboxInput,
  type MailAlias,
  type MailDomain,
  type MailLogEntry,
  type MailLogFilter,
  type MailProvider,
  type Mailbox,
  type UpdateMailboxInput,
} from './types'
import { validateAliasDestinations } from './alias-destinations'
import { getWebmailUrl } from './webmail'

/**
 * In-memory mail provider used until a real one (Mailcow / Zoho / Workspace) is
 * connected.
 *
 * It deliberately enforces the same invariants a real provider would — unique
 * local parts, address syntax, alias destinations resolving to real mailboxes,
 * quota ceilings, domain-must-be-active — so that swapping in a live adapter
 * does not change observable behaviour or surface new failure modes in the UI.
 *
 * State is module-level and therefore resets on every server restart or
 * redeploy. That is expected for a mock and is precisely why all access goes
 * through the `MailProvider` seam.
 */

const SEED_DOMAIN_ID = 'dom_gloval_ai'
/** Placeholder owner for seed data; no real user is claimed. */
const SEED_USER_ID = 'seed-user'

const domains = new Map<string, MailDomain>()
const mailboxes = new Map<string, Mailbox>()
const aliases = new Map<string, MailAlias>()
let logs: MailLogEntry[] = []
let seeded = false

let counter = 0
function id(prefix: string): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`
}

/** Deterministic offset so seeded timestamps are stable-ish and ordered. */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

function seed() {
  if (seeded) return
  seeded = true

  domains.set(SEED_DOMAIN_ID, {
    id: SEED_DOMAIN_ID,
    userId: SEED_USER_ID,
    domain: 'gloval.ai',
    status: 'active',
    dns: dnsFor('gloval.ai', true),
    createdAt: hoursAgo(24 * 30),
  })

  const seedBoxes: Array<[string, string, number, number]> = [
    ['info', 'Bilgi', 5120, 1240],
    ['destek', 'Destek Ekibi', 5120, 3980],
    ['satis', 'Satış', 2048, 190],
  ]
  for (const [localPart, displayName, quotaMb, usedMb] of seedBoxes) {
    const boxId = id('mbx')
    mailboxes.set(boxId, {
      id: boxId,
      domainId: SEED_DOMAIN_ID,
      localPart,
      address: `${localPart}@gloval.ai`,
      displayName,
      quotaMb,
      usedMb,
      status: 'active',
      createdAt: hoursAgo(24 * 20),
    })
  }

  const aliasId = id('als')
  aliases.set(aliasId, {
    id: aliasId,
    domainId: SEED_DOMAIN_ID,
    address: 'iletisim@gloval.ai',
    destinations: ['info@gloval.ai'],
    createdAt: hoursAgo(24 * 12),
  })

  const logSeed: Array<[string, string, string, MailLogEntry['status'], string?]> = [
    ['musteri@ornek.com', 'info@gloval.ai', 'Teklif talebi', 'delivered'],
    ['info@gloval.ai', 'musteri@ornek.com', 'Re: Teklif talebi', 'delivered'],
    ['destek@gloval.ai', 'kullanici@ornek.com', 'Destek kaydınız açıldı', 'delivered'],
    ['newsletter@pazarlama.net', 'satis@gloval.ai', 'Kampanya duyurusu', 'rejected', 'SPF doğrulaması başarısız'],
    ['info@gloval.ai', 'eski-adres@kapali.com', 'Sipariş onayı', 'bounced', '550 5.1.1 kullanıcı bulunamadı'],
    ['satis@gloval.ai', 'tedarikci@ornek.com', 'Fiyat listesi', 'delivered'],
    ['destek@gloval.ai', 'yavas@ornek.com', 'Kurulum adımları', 'deferred', '451 geçici olarak reddedildi, yeniden denenecek'],
    ['bot@spam.example', 'info@gloval.ai', 'Kazandınız!', 'rejected', 'RBL listesinde'],
    ['musteri2@ornek.com', 'destek@gloval.ai', 'Fatura sorusu', 'delivered'],
    ['info@gloval.ai', 'muhasebe@ornek.com', 'Ekim faturası', 'delivered'],
    ['iletisim@gloval.ai', 'info@gloval.ai', 'Web formu mesajı', 'delivered'],
    ['satis@gloval.ai', 'dolu-kutu@ornek.com', 'Sözleşme taslağı', 'bounced', '552 posta kutusu dolu'],
  ]
  logs = logSeed.map(([from, to, subject, status, detail], i) => ({
    id: id('log'),
    at: hoursAgo(i * 3 + 1),
    from,
    to,
    subject,
    status,
    detail,
  }))
}

/** DNS expectations a customer must publish. Mirrors a real provider's list. */
function dnsFor(domain: string, verified: boolean): MailDomain['dns'] {
  return [
    { type: 'MX', host: '@', value: `mx1.${domain}`, priority: 10, verified },
    { type: 'MX', host: '@', value: `mx2.${domain}`, priority: 20, verified },
    { type: 'TXT', host: '@', value: `v=spf1 include:_spf.${domain} ~all`, verified },
    { type: 'TXT', host: 'gloval._domainkey', value: 'v=DKIM1; k=rsa; p=MIGfMA0GCSq...', verified },
    {
      type: 'TXT',
      host: '_dmarc',
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
      verified,
    },
  ]
}

/** Simulated network latency so loading states are exercised realistically. */
function latency<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function requireDomain(domainId: string): MailDomain {
  seed()
  const domain = domains.get(domainId)
  if (!domain) throw new MailError('NOT_FOUND')
  return domain
}

export const mockMailProvider: MailProvider = {
  id: 'mock',

  async listDomains(userId) {
    seed()
    const all = [...domains.values()]
    return latency(userId ? all.filter((d) => d.userId === userId) : all)
  },

  async getDomain(domainId) {
    seed()
    return latency(domains.get(domainId) ?? null)
  },

  /**
   * Adopt a domain owned by the shared custom-domain layer.
   *
   * Called whenever the customer's verified custom domains are resolved, so a
   * freshly verified `firma.com` becomes a valid `domainId` for mailbox and
   * alias creation. Existing mailboxes are preserved on re-registration; only
   * the domain's own status and DNS expectations are refreshed.
   */
  async ensureDomain(domain) {
    seed()
    const existing = domains.get(domain.id)
    const next: MailDomain = existing
      ? { ...existing, status: domain.status, dns: domain.dns }
      : { ...domain }
    domains.set(next.id, next)
    return next
  },

  async verifyDomain(domainId) {
    const domain = requireDomain(domainId)
    // Progress the record through a believable lifecycle instead of flipping
    // straight to active: pending -> verifying -> active.
    const next: MailDomain =
      domain.status === 'active'
        ? domain
        : {
            ...domain,
            status: domain.status === 'verifying' ? 'active' : 'verifying',
            dns: dnsFor(domain.domain, domain.status === 'verifying'),
          }
    domains.set(domainId, next)
    return latency(next, 400)
  },

  async listMailboxes(domainId) {
    seed()
    return latency(
      [...mailboxes.values()]
        .filter((m) => m.domainId === domainId)
        .sort((a, b) => a.localPart.localeCompare(b.localPart)),
    )
  },

  async createMailbox({ domainId, localPart, displayName, quotaMb }) {
    const domain = requireDomain(domainId)
    if (domain.status !== 'active') throw new MailError('DOMAIN_NOT_ACTIVE')

    const normalized = localPart.trim().toLowerCase()
    if (!isValidLocalPart(normalized)) throw new MailError('INVALID_ADDRESS')

    const address = `${normalized}@${domain.domain}`
    const clash =
      [...mailboxes.values()].some((m) => m.address === address) ||
      [...aliases.values()].some((a) => a.address === address)
    if (clash) throw new MailError('MAILBOX_EXISTS')

    if (quotaMb <= 0) throw new MailError('QUOTA_EXCEEDED')

    const box: Mailbox = {
      id: id('mbx'),
      domainId,
      localPart: normalized,
      address,
      displayName: displayName.trim() || normalized,
      quotaMb,
      usedMb: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    mailboxes.set(box.id, box)
    return latency(box, 250)
  },

  async updateMailbox(mailboxId, input) {
    seed()
    const box = mailboxes.get(mailboxId)
    if (!box) throw new MailError('NOT_FOUND')

    // Never allow a quota below what is already stored on disk; a real provider
    // would refuse to strand existing mail.
    if (input.quotaMb != null && input.quotaMb < box.usedMb) {
      throw new MailError('QUOTA_EXCEEDED')
    }

    const next: Mailbox = {
      ...box,
      displayName: input.displayName?.trim() || box.displayName,
      quotaMb: input.quotaMb ?? box.quotaMb,
      status: input.status ?? box.status,
    }
    mailboxes.set(mailboxId, next)
    return latency(next, 200)
  },

  async deleteMailbox(mailboxId) {
    seed()
    const box = mailboxes.get(mailboxId)
    if (!box) throw new MailError('NOT_FOUND')

    // Deleting a mailbox must not leave aliases pointing at a dead address.
    for (const [aliasId, alias] of aliases) {
      if (!alias.destinations.includes(box.address)) continue
      const destinations = alias.destinations.filter((d) => d !== box.address)
      if (destinations.length === 0) aliases.delete(aliasId)
      else aliases.set(aliasId, { ...alias, destinations })
    }

    mailboxes.delete(mailboxId)
    await latency(null, 200)
  },

  async setPassword(mailboxId, _password) {
    seed()
    if (!mailboxes.has(mailboxId)) throw new MailError('NOT_FOUND')
    // The mock has no credential store; the password is intentionally discarded.
    await latency(null, 250)
  },

  async listAliases(domainId) {
    seed()
    return latency(
      [...aliases.values()]
        .filter((a) => a.domainId === domainId)
        .sort((a, b) => a.address.localeCompare(b.address)),
    )
  },

  async createAlias({ domainId, localPart, destinations }) {
    const domain = requireDomain(domainId)
    if (domain.status !== 'active') throw new MailError('DOMAIN_NOT_ACTIVE')

    const normalized = localPart.trim().toLowerCase()
    if (!isValidLocalPart(normalized)) throw new MailError('INVALID_ADDRESS')

    const address = `${normalized}@${domain.domain}`
    const clash =
      [...aliases.values()].some((a) => a.address === address) ||
      [...mailboxes.values()].some((m) => m.address === address)
    if (clash) throw new MailError('ALIAS_EXISTS')

    // Addresses on this domain must be real mailboxes/aliases, otherwise the
    // alias would silently black-hole mail. External addresses are allowed.
    const known = new Set([
      ...[...mailboxes.values()].filter((m) => m.domainId === domainId).map((m) => m.address),
      ...[...aliases.values()].filter((a) => a.domainId === domainId).map((a) => a.address),
    ])
    const checked = validateAliasDestinations({
      aliasAddress: address,
      domain: domain.domain,
      destinations,
      internalAddresses: known,
    })
    if (!checked.ok) throw new MailError(checked.code)

    const alias: MailAlias = {
      id: id('als'),
      domainId,
      address,
      destinations: checked.destinations,
      createdAt: new Date().toISOString(),
    }
    aliases.set(alias.id, alias)
    return latency(alias, 250)
  },

  async deleteAlias(aliasId) {
    seed()
    if (!aliases.has(aliasId)) throw new MailError('NOT_FOUND')
    aliases.delete(aliasId)
    await latency(null, 200)
  },

  async listLogs({ domainId, status, search, limit = 100 }) {
    seed()
    const addresses = domainId
      ? new Set([
          ...[...mailboxes.values()].filter((m) => m.domainId === domainId).map((m) => m.address),
          ...[...aliases.values()].filter((a) => a.domainId === domainId).map((a) => a.address),
        ])
      : null

    const needle = search?.trim().toLowerCase()
    const result = logs
      .filter((entry) => {
        if (addresses && !addresses.has(entry.from) && !addresses.has(entry.to)) return false
        if (status && entry.status !== status) return false
        if (needle) {
          const haystack = `${entry.from} ${entry.to} ${entry.subject}`.toLowerCase()
          if (!haystack.includes(needle)) return false
        }
        return true
      })
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)

    return latency(result)
  },

  webmailUrl() {
    return getWebmailUrl()
  },
}
