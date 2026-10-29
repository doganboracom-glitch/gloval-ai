import dns from 'node:dns'
import { BlockList, isIP } from 'node:net'

/**
 * SSRF guard. A hostname is only usable when EVERY address it resolves to is a
 * public, globally routable one. The check runs inside the socket `lookup`, so
 * the address that is validated is the address that is connected to (no
 * resolve-then-connect gap that DNS rebinding could use).
 */

const reserved = new BlockList()

const V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]
const V6: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
]
for (const [net, prefix] of V4) reserved.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of V6) reserved.addSubnet(net, prefix, 'ipv6')

// Node matches an IPv6 ::ffff:0:0/96 rule against every IPv4 address, so mapped
// addresses are unwrapped by hand and judged by their embedded IPv4 instead.
const MAPPED_V4 = /^(?:0{0,4}:){0,5}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

export function isPublicIp(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return false
  if (family === 6) {
    const mapped = MAPPED_V4.exec(address)
    if (mapped) return isPublicIp(mapped[1])
    // Hex-form mapped addresses (::ffff:7f00:1) are refused outright.
    if (/^(?:0{0,4}:){0,5}ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(address)) return false
  }
  return !reserved.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

export class BlockedAddressError extends Error {
  readonly code = 'BLOCKED_ADDRESS'
  constructor() {
    super('blocked address')
    this.name = 'BlockedAddressError'
  }
}

export type ResolvedAddress = { address: string; family: number }
export type ResolveAll = (hostname: string) => Promise<ResolvedAddress[]>

const systemResolveAll: ResolveAll = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true })

/** Resolves a host and throws unless every returned address is public. */
export async function resolvePublicAddresses(
  hostname: string,
  resolveAll: ResolveAll = systemResolveAll,
): Promise<ResolvedAddress[]> {
  // An IP literal as a host is never allowed: only names that come from the bootstrap file.
  if (isIP(hostname) !== 0) throw new BlockedAddressError()
  const addresses = await resolveAll(hostname)
  if (addresses.length === 0 || addresses.some((a) => !isPublicIp(a.address))) throw new BlockedAddressError()
  return addresses
}

type LookupCallback = (err: Error | null, address?: string | ResolvedAddress[], family?: number) => void

/** `lookup` option for https.request: validates the addresses it hands to the socket. */
export function createGuardedLookup(resolveAll: ResolveAll = systemResolveAll) {
  return (hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    resolvePublicAddresses(hostname, resolveAll).then(
      (addresses) => {
        if (options?.all) callback(null, addresses)
        else callback(null, addresses[0].address, addresses[0].family)
      },
      (error: Error) => callback(error),
    )
  }
}
