const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const IPV4_LITERAL = /^(?:\d{1,3}\.){3}\d{1,3}$/

export type NameserverValidation =
  | { ok: true; nameservers: string[] }
  | { ok: false; reason: 'count' | 'invalid' | 'duplicate' }

export function normalizeNameserver(value: unknown): string | null {
  if (typeof value !== 'string' || /\s/.test(value)) return null

  const hostname = value.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname.length > 253 || IPV4_LITERAL.test(hostname)) return null

  const labels = hostname.split('.')
  if (labels.length < 2 || labels.some((label) => !HOSTNAME_LABEL.test(label))) return null

  return hostname
}

export function normalizeNameservers(value: unknown): NameserverValidation {
  if (!Array.isArray(value) || value.length < 2 || value.length > 13) {
    return { ok: false, reason: 'count' }
  }

  const nameservers: string[] = []
  for (const entry of value) {
    const hostname = normalizeNameserver(entry)
    if (!hostname) return { ok: false, reason: 'invalid' }
    nameservers.push(hostname)
  }

  if (new Set(nameservers).size !== nameservers.length) {
    return { ok: false, reason: 'duplicate' }
  }

  return { ok: true, nameservers }
}
