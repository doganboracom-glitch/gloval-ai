import { isIP } from 'node:net'

/** Expands an IPv6 literal to eight 16-bit groups, or null when it is not valid. */
function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase()
  const zone = text.indexOf('%')
  if (zone !== -1) text = text.slice(0, zone)

  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  if (tail.includes('.')) {
    const octets = tail.split('.').map(Number)
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest]
  if (groups.length !== 8) return null
  const numbers = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN))
  return numbers.some(Number.isNaN) ? null : numbers
}

/**
 * Quota key of an address: IPv4 as is, IPv6 reduced to its /64 network so one
 * household or host cannot multiply its allowance with the interface id.
 * IPv4-mapped IPv6 addresses count as the IPv4 address. Null for anything else.
 */
export function networkKeyForIp(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  const family = isIP(value)
  if (family === 4) return value
  if (family !== 6) return null
  const groups = expandIpv6(value)
  if (!groups) return null
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`
}

/** Client IP from platform headers: Vercel's own header first, then the first hop of x-forwarded-for. */
export function clientIpFromHeaders(headers: Pick<Headers, 'get'>): string | null {
  const vercel = headers.get('x-vercel-forwarded-for')?.split(',')[0]
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]
  return networkKeyForIp(vercel) ?? networkKeyForIp(forwarded)
}
