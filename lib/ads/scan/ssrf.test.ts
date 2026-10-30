import { describe, expect, it, vi } from 'vitest'
import {
  BlockedAddressError,
  createGuardedLookup,
  isPublicIp,
  resolvePublicAddresses,
  type ResolvedAddress,
} from '@/lib/whois/ip-guard'

const PUBLIC_V4: ResolvedAddress = { address: '93.184.216.34', family: 4 }

describe('isPublicIp', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',
    '172.15.255.255',
    '93.184.216.34',
    '2001:4860:4860::8888',
    '2606:4700::1111',
    '::ffff:8.8.8.8',
  ])('accepts the public address %s', (address) => {
    expect(isPublicIp(address)).toBe(true)
  })

  it.each([
    ['0.0.0.0', 'this-network'],
    ['0.1.2.3', 'this-network'],
    ['10.0.0.1', 'RFC1918 10/8'],
    ['10.255.255.255', 'RFC1918 10/8'],
    ['172.16.0.1', 'RFC1918 172.16/12'],
    ['172.31.255.255', 'RFC1918 172.16/12'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['169.254.169.254', 'cloud metadata (AWS / GCP / Azure)'],
    ['169.254.0.1', 'link-local'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['100.100.100.200', 'Alibaba metadata'],
    ['192.0.0.192', 'IETF protocol assignments (Oracle metadata)'],
    ['198.18.0.1', 'benchmarking'],
    ['192.0.2.1', 'documentation'],
    ['224.0.0.1', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique-local'],
    ['fd00::1', 'IPv6 unique-local'],
    ['fd00:ec2::254', 'AWS IPv6 metadata'],
    ['fec0::1', 'IPv6 site-local'],
    ['ff02::1', 'IPv6 multicast'],
    ['2001:db8::1', 'IPv6 documentation'],
    ['64:ff9b::7f00:1', 'NAT64 wrapping 127.0.0.1'],
    ['2002:7f00:1::', '6to4 wrapping 127.0.0.1'],
    ['2001::1', 'Teredo'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['::ffff:7f00:1', 'hex IPv4-mapped loopback'],
    ['::127.0.0.1', 'IPv4-compatible loopback'],
    ['::7f00:1', 'IPv4-compatible loopback, hex form'],
    ['::a00:1', 'IPv4-compatible 10.0.0.1'],
    ['::ffff:0:127.0.0.1', 'SIIT loopback'],
  ])('refuses %s (%s)', (address) => {
    expect(isPublicIp(address)).toBe(false)
  })

  it.each(['', 'abc', '1.2.3', '256.1.1.1', 'localhost', '[::1]', '1.1.1.1/8'])('refuses the non-address %j', (value) => {
    expect(isPublicIp(value)).toBe(false)
  })
})

describe('resolvePublicAddresses', () => {
  it('returns the addresses when every one is public', async () => {
    const resolveAll = vi.fn(async () => [PUBLIC_V4, { address: '2606:4700::1111', family: 6 }])
    await expect(resolvePublicAddresses('example.com', resolveAll)).resolves.toHaveLength(2)
  })

  it('refuses a public-looking name that resolves to loopback', async () => {
    const resolveAll = async () => [{ address: '127.0.0.1', family: 4 }]
    await expect(resolvePublicAddresses('localtest.me', resolveAll)).rejects.toBeInstanceOf(BlockedAddressError)
  })

  it('refuses the cloud metadata address behind a name', async () => {
    const resolveAll = async () => [{ address: '169.254.169.254', family: 4 }]
    await expect(resolvePublicAddresses('metadata.example.com', resolveAll)).rejects.toBeInstanceOf(BlockedAddressError)
  })

  it('refuses when ANY returned address is private (mixed answer)', async () => {
    const resolveAll = async () => [PUBLIC_V4, { address: '10.0.0.5', family: 4 }]
    await expect(resolvePublicAddresses('mixed.example.com', resolveAll)).rejects.toBeInstanceOf(BlockedAddressError)
  })

  it('refuses a private IPv6 address mixed into an otherwise public answer', async () => {
    const resolveAll = async () => [PUBLIC_V4, { address: 'fd00::1', family: 6 }]
    await expect(resolvePublicAddresses('mixed6.example.com', resolveAll)).rejects.toBeInstanceOf(BlockedAddressError)
  })

  it('refuses an empty answer', async () => {
    await expect(resolvePublicAddresses('empty.example.com', async () => [])).rejects.toBeInstanceOf(BlockedAddressError)
  })

  it('never resolves an IP literal used as a host', async () => {
    const resolveAll = vi.fn(async () => [PUBLIC_V4])
    await expect(resolvePublicAddresses('8.8.8.8', resolveAll)).rejects.toBeInstanceOf(BlockedAddressError)
    await expect(resolvePublicAddresses('::1', resolveAll)).rejects.toBeInstanceOf(BlockedAddressError)
    expect(resolveAll).not.toHaveBeenCalled()
  })
})

describe('createGuardedLookup (the validation that runs at connection time)', () => {
  function lookup(guard: ReturnType<typeof createGuardedLookup>, host: string, all = false) {
    return new Promise<{ error: Error | null; address?: unknown; family?: number }>((resolve) => {
      guard(host, { all }, (error, address, family) => resolve({ error, address, family }))
    })
  }

  it('hands a validated address to the socket', async () => {
    const guard = createGuardedLookup(async () => [PUBLIC_V4])
    expect(await lookup(guard, 'example.com')).toMatchObject({ error: null, address: '93.184.216.34', family: 4 })
    expect((await lookup(guard, 'example.com', true)).address).toEqual([PUBLIC_V4])
  })

  it('answers every connection with a fresh check, so DNS rebinding is refused on the second connect', async () => {
    const answers: ResolvedAddress[][] = [[PUBLIC_V4], [{ address: '127.0.0.1', family: 4 }]]
    const resolveAll = vi.fn(async () => answers.shift() ?? [])
    const guard = createGuardedLookup(resolveAll)

    expect((await lookup(guard, 'rebind.example.com')).error).toBeNull()
    const second = await lookup(guard, 'rebind.example.com')
    expect(second.error).toBeInstanceOf(BlockedAddressError)
    expect(second.address).toBeUndefined()
    expect(resolveAll).toHaveBeenCalledTimes(2)
  })

  it('passes a DNS failure through as an error, never as an address', async () => {
    const guard = createGuardedLookup(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    })
    const result = await lookup(guard, 'nope.example.com')
    expect(result.error).toBeInstanceOf(Error)
    expect(result.address).toBeUndefined()
  })
})
