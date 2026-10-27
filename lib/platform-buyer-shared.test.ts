import { describe, expect, it } from 'vitest'
import {
  buildPlatformBuyer,
  extractPublicClientIp,
  isPublicIPv4,
  maskPublicIPv4ForLog,
  resolvePublicClientIp,
} from '@/lib/platform-buyer-shared'
import { buildIyzicoBuyerPayload, IYZICO_SANDBOX_TEST_FIXTURES } from '@/lib/payments/iyzico-buyer'
import { PaymentBuyerError } from '@/lib/payments/types'

const individual = {
  customerType: 'individual',
  fullName: 'Ayşe Yılmaz',
  companyTitle: '',
  taxOffice: '',
  nationalId: '10000000146',
  taxNumber: '',
  addressLine: 'Atatürk Caddesi No: 10',
  district: 'Kadıköy',
  city: 'İstanbul',
  postalCode: '34710',
  country: 'TR',
  phone: '+90 532 555 10 10',
  invoiceEmail: 'ayse@example.com',
  eInvoicePayer: false,
}

const company = {
  ...individual,
  customerType: 'company',
  fullName: 'Mehmet Demir',
  companyTitle: 'Demir Ticaret Ltd. Şti.',
  taxOffice: 'Kadıköy',
  nationalId: '',
  taxNumber: '1234567890',
}

const headersOf = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
})

function fieldsOf(result: ReturnType<typeof buildPlatformBuyer>) {
  return result.ok ? {} : result.fieldErrors
}

describe('extractPublicClientIp', () => {
  it('prefers Cloudflare client IP over the other request headers', () => {
    expect(
      resolvePublicClientIp(
        headersOf({
          'cf-connecting-ip': '88.230.1.9',
          'x-real-ip': '9.9.9.9',
          'x-vercel-forwarded-for': '1.1.1.1',
          'x-forwarded-for': '8.8.8.8',
        }),
      ),
    ).toEqual({ ip: '88.230.1.9', header: 'cf-connecting-ip' })
  })

  it('checks x-real-ip, x-vercel-forwarded-for, then x-forwarded-for', () => {
    expect(
      resolvePublicClientIp(
        headersOf({
          'x-real-ip': '9.9.9.9',
          'x-vercel-forwarded-for': '1.1.1.1',
          'x-forwarded-for': '8.8.8.8',
        }),
      ),
    ).toEqual({ ip: '9.9.9.9', header: 'x-real-ip' })

    expect(
      resolvePublicClientIp(
        headersOf({
          'x-real-ip': '172.23.40.86',
          'x-vercel-forwarded-for': '1.1.1.1',
          'x-forwarded-for': '8.8.8.8',
        }),
      ),
    ).toEqual({ ip: '1.1.1.1', header: 'x-vercel-forwarded-for' })
  })

  it('uses the first public IPv4 from the forwarded chain after filtering private entries', () => {
    expect(
      extractPublicClientIp(
        headersOf({ 'x-forwarded-for': '10.0.0.4, 172.23.40.86, 88.230.1.9, 172.16.0.2' }),
      ),
    ).toBe('88.230.1.9')
  })

  it('normalizes dotted and hexadecimal IPv4-mapped IPv6 addresses', () => {
    expect(extractPublicClientIp(headersOf({ 'cf-connecting-ip': '::ffff:88.230.1.9' }))).toBe('88.230.1.9')
    expect(extractPublicClientIp(headersOf({ 'cf-connecting-ip': '::ffff:58e6:109' }))).toBe('88.230.1.9')
    expect(extractPublicClientIp(headersOf({ 'cf-connecting-ip': '0:0:0:0:0:ffff:58e6:109' }))).toBe('88.230.1.9')
    expect(extractPublicClientIp(headersOf({ 'cf-connecting-ip': '::ffff:ac17:2856' }))).toBeNull()
  })

  it('returns null when no public IP exists (never a sample IP)', () => {
    expect(extractPublicClientIp(headersOf({}))).toBeNull()
    expect(
      extractPublicClientIp(
        headersOf({
          'cf-connecting-ip': '172.23.40.86',
          'x-real-ip': '10.0.0.1',
          'x-vercel-forwarded-for': '100.64.0.1',
          'x-forwarded-for': '127.0.0.1, 192.168.1.5, ::1',
        }),
      ),
    ).toBeNull()
    expect(
      extractPublicClientIp(
        headersOf({
          'cf-connecting-ip': '',
          'x-real-ip': '...',
          'x-vercel-forwarded-for': '::ffff:999.1.1.1',
          'x-forwarded-for': ', 1.2.3, 999.999.999.999',
        }),
      ),
    ).toBeNull()
  })

  it('rejects private, reserved, loopback and link-local IPv4 and IPv6', () => {
    for (const ip of [
      '0.0.0.0',
      '0.1.2.3',
      '10.1.1.1',
      '127.0.0.1',
      '169.254.1.1',
      '172.16.0.1',
      '172.23.40.86',
      '172.31.255.254',
      '192.168.0.1',
      '100.64.0.1',
      '100.127.255.254',
      '192.0.2.1',
      '192.88.99.1',
      '198.18.0.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '999.1.1.1',
      '::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '::ffff:172.23.40.86',
      '::ffff:ac17:2856',
      'abc',
    ]) {
      expect(isPublicIPv4(ip), ip).toBe(false)
    }
    expect(isPublicIPv4('88.230.1.9')).toBe(true)
  })

  it('masks the final IPv4 octet before logging', () => {
    expect(maskPublicIPv4ForLog('88.230.1.9')).toBe('88.230.1.xxx')
    expect(maskPublicIPv4ForLog('172.23.40.86')).toBeNull()
  })
})

describe('buildPlatformBuyer', () => {
  it('builds the buyer from an individual profile with a valid TCKN', () => {
    const r = buildPlatformBuyer(individual, '88.230.1.9')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.buyer).toMatchObject({
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      email: 'ayse@example.com',
      phone: '+905325551010',
      identityNumber: '10000000146',
      city: 'İstanbul',
      district: 'Kadıköy',
      ip: '88.230.1.9',
    })
  })

  it('uses the 10-digit VKN for a company profile', () => {
    const r = buildPlatformBuyer(company, '88.230.1.9')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.buyer.identityNumber).toBe('1234567890')
  })

  it('rejects an invalid TCKN and an invalid VKN with a field error', () => {
    expect(fieldsOf(buildPlatformBuyer({ ...individual, nationalId: '11111111111' }, '88.230.1.9'))).toHaveProperty('nationalId')
    expect(fieldsOf(buildPlatformBuyer({ ...individual, nationalId: '1234567890' }, '88.230.1.9'))).toHaveProperty('nationalId')
    expect(fieldsOf(buildPlatformBuyer({ ...company, taxNumber: '12345' }, '88.230.1.9'))).toHaveProperty('taxNumber')
  })

  it('rejects a missing address, e-mail and non-mobile phone', () => {
    expect(fieldsOf(buildPlatformBuyer({ ...individual, addressLine: '' }, null))).toHaveProperty('addressLine')
    expect(fieldsOf(buildPlatformBuyer({ ...individual, city: '' }, null))).toHaveProperty('city')
    expect(fieldsOf(buildPlatformBuyer({ ...individual, district: '' }, null))).toHaveProperty('district')
    expect(fieldsOf(buildPlatformBuyer({ ...individual, invoiceEmail: 'nope' }, null))).toHaveProperty('invoiceEmail')
    expect(fieldsOf(buildPlatformBuyer({ ...individual, phone: '+90 212 555 10 10' }, null))).toHaveProperty('phone')
  })
})

describe('buildIyzicoBuyerPayload (live path)', () => {
  const base = (ip: string | null) => {
    const r = buildPlatformBuyer(individual, ip)
    if (!r.ok) throw new Error('fixture profile must be valid')
    return { orderId: 'ord_1', customerEmail: 'ayse@example.com', buyer: r.buyer }
  }

  it('sends the real profile values and real IP', () => {
    const { buyer } = buildIyzicoBuyerPayload(base('88.230.1.9'), { isSandbox: false })
    expect(buyer).toMatchObject({
      name: 'Ayşe',
      surname: 'Yılmaz',
      identityNumber: '10000000146',
      gsmNumber: '+905325551010',
      ip: '88.230.1.9',
      city: 'İstanbul',
    })
  })

  it('refuses to start without a public IP', () => {
    expect(() => buildIyzicoBuyerPayload(base(null), { isSandbox: false })).toThrow(PaymentBuyerError)
    try {
      buildIyzicoBuyerPayload(base(null), { isSandbox: false })
    } catch (e) {
      expect((e as PaymentBuyerError).field).toBe('ip')
    }
  })

  it('refuses a private IP', () => {
    expect(() => buildIyzicoBuyerPayload(base('10.0.0.1'), { isSandbox: false })).toThrow(PaymentBuyerError)
  })

  it('never substitutes fixture identity, IP, phone or address live', () => {
    const payload = JSON.stringify(buildIyzicoBuyerPayload(base('88.230.1.9'), { isSandbox: false }))
    for (const fake of [IYZICO_SANDBOX_TEST_FIXTURES.identityNumber, IYZICO_SANDBOX_TEST_FIXTURES.ip, IYZICO_SANDBOX_TEST_FIXTURES.gsmNumber, IYZICO_SANDBOX_TEST_FIXTURES.address, '11111111111', '85.34.78.112']) {
      expect(payload).not.toContain(fake)
    }
  })

  it('throws instead of filling an invalid identity, phone or address live', () => {
    const real = base('88.230.1.9')
    const withBuyer = (patch: Record<string, string>) => ({ ...real, buyer: { ...real.buyer, ...patch } })
    expect(() => buildIyzicoBuyerPayload(withBuyer({ identityNumber: '11111111111' }), { isSandbox: false })).toThrow(PaymentBuyerError)
    expect(() => buildIyzicoBuyerPayload(withBuyer({ phone: '' }), { isSandbox: false })).toThrow(PaymentBuyerError)
    expect(() => buildIyzicoBuyerPayload(withBuyer({ address: '' }), { isSandbox: false })).toThrow(PaymentBuyerError)
  })

  it('only the labelled sandbox fixtures may fill a gap, and only in sandbox mode', () => {
    const real = base(null)
    const { buyer } = buildIyzicoBuyerPayload(real, { isSandbox: true })
    expect(buyer.ip).toBe(IYZICO_SANDBOX_TEST_FIXTURES.ip)
  })
})
