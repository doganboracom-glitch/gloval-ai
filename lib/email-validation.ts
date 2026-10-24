/**
 * Sign-up email validation.
 *
 * `<input type="email">` accepts `ad@hotmailcom` (a dotless host is legal for
 * the HTML spec), and Supabase then rejects it with a generic error. We check
 * the shape ourselves and, for the common provider typos, offer the fix.
 */

const COMMON_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'yandex.com',
  'live.com',
  'msn.com',
  'proton.me',
  'protonmail.com',
  'mynet.com',
  'gmx.com',
] as const

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const TLD = /^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/

export type EmailCheck =
  | { ok: true; email: string; suggestion?: string }
  | { ok: false; reason: 'format' | 'domain'; suggestion?: string }

function editDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0)
    row[0] = i
    return row
  })
  for (let j = 0; j < cols; j++) d[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      // Adjacent swap (gmial -> gmail) counts as one edit.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[rows - 1][cols - 1]
}

/** The provider the user most likely meant, or null when the domain looks fine. */
export function suggestDomain(domain: string): string | null {
  const host = domain.toLowerCase()
  if ((COMMON_DOMAINS as readonly string[]).includes(host)) return null

  // `hotmailcom` -> `hotmail.com`
  const dotless = COMMON_DOMAINS.find((d) => d.replace(/\./g, '') === host)
  if (dotless) return dotless

  if (host.length < 5) return null
  // Same first letter keeps real, different providers (mail.com vs gmail.com) quiet.
  const close = COMMON_DOMAINS.find(
    (d) => d[0] === host[0] && editDistance(host, d) <= (d.length >= 10 ? 2 : 1),
  )
  return close ?? null
}

export function validateEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at <= 0 || at !== email.indexOf('@') || email.length > 254) {
    return { ok: false, reason: 'format' }
  }

  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (
    local.length > 64 ||
    /\s/.test(email) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  ) {
    return { ok: false, reason: 'format' }
  }

  const labels = domain.split('.')
  const tld = labels[labels.length - 1]
  const wellFormed =
    labels.length >= 2 && labels.every((l) => DOMAIN_LABEL.test(l)) && TLD.test(tld)
  if (!wellFormed) {
    const fix = suggestDomain(domain)
    return {
      ok: false,
      reason: 'domain',
      suggestion: fix ? `${local}@${fix}` : undefined,
    }
  }

  const fix = suggestDomain(domain)
  return { ok: true, email, ...(fix ? { suggestion: `${local}@${fix}` } : {}) }
}
