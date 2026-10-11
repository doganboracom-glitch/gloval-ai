import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildUserBasket,
  computeCallbackHash,
  computeTokenHash,
  credentialFingerprint,
  maskSecret,
  parsePaytrCallbackBody,
  pickClientIp,
  toMerchantOid,
  toPaytrCurrency,
  validatePaytrInput,
  verifyCallbackHash,
  type PaytrTokenFields,
} from '@/lib/store-payments/paytr-core'

// Placeholder credentials in the style of PayTR's own sample code
// (MAGAZA_NO / XXXXXXXXXXX / YYYYYYYYYYY). The expected values below were
// produced independently with Node's crypto, following the formulas of the
// PayTR iFrame API docs, so a regression in our implementation cannot hide.
const KEY = 'XXXXXXXXXXX'
const SALT = 'YYYYYYYYYYY'

describe('computeCallbackHash', () => {
  it('matches the PayTR documented formula: base64(HMAC_SHA256(oid + salt + status + total, key))', () => {
    const fields = { merchantOid: 'ORDER123', status: 'success', totalAmount: '10099' }
    const reference = createHmac('sha256', KEY).update('ORDER123' + SALT + 'success' + '10099').digest('base64')
    expect(computeCallbackHash(fields, SALT, KEY)).toBe(reference)
    expect(computeCallbackHash(fields, SALT, KEY)).toBe('+6OH5+0ihH06PdPLZNXETvFbN46dqcxKFfj6QuETihM=')
  })

  it('changes when any signed field, the salt or the key changes', () => {
    const base = { merchantOid: 'ORDER123', status: 'success', totalAmount: '10099' }
    const hash = computeCallbackHash(base, SALT, KEY)
    expect(computeCallbackHash({ ...base, merchantOid: 'ORDER124' }, SALT, KEY)).not.toBe(hash)
    expect(computeCallbackHash({ ...base, status: 'failed' }, SALT, KEY)).not.toBe(hash)
    expect(computeCallbackHash({ ...base, totalAmount: '10098' }, SALT, KEY)).not.toBe(hash)
    expect(computeCallbackHash(base, 'OTHERSALT', KEY)).not.toBe(hash)
    expect(computeCallbackHash(base, SALT, 'OTHERKEYYY')).not.toBe(hash)
  })
})

describe('verifyCallbackHash', () => {
  const fields = { merchantOid: 'ORDER123', status: 'success', totalAmount: '10099' }
  const good = computeCallbackHash(fields, SALT, KEY)

  it('accepts the correct hash', () => {
    expect(verifyCallbackHash({ ...fields, hash: good }, SALT, KEY)).toBe(true)
  })

  it('rejects a wrong, empty, truncated or differently-sized hash', () => {
    expect(verifyCallbackHash({ ...fields, hash: 'AAAA' }, SALT, KEY)).toBe(false)
    expect(verifyCallbackHash({ ...fields, hash: '' }, SALT, KEY)).toBe(false)
    expect(verifyCallbackHash({ ...fields, hash: good.slice(0, -2) }, SALT, KEY)).toBe(false)
    expect(verifyCallbackHash({ ...fields, hash: good + 'A' }, SALT, KEY)).toBe(false)
  })

  it('rejects a hash signed with another store\u2019s key or salt', () => {
    const other = computeCallbackHash(fields, 'OTHERSALT1', 'OTHERKEY111')
    expect(verifyCallbackHash({ ...fields, hash: other }, SALT, KEY)).toBe(false)
  })

  it('rejects a valid hash when the amount or status was tampered with', () => {
    expect(verifyCallbackHash({ ...fields, totalAmount: '1', hash: good }, SALT, KEY)).toBe(false)
    expect(verifyCallbackHash({ ...fields, status: 'failed', hash: good }, SALT, KEY)).toBe(false)
  })
})

describe('computeTokenHash', () => {
  const basket = buildUserBasket([
    { name: 'Ornek Urun 1', unitPriceCents: 5000, quantity: 1 },
    { name: 'Ornek Urun 2', unitPriceCents: 3325, quantity: 2 },
  ])
  const fields: PaytrTokenFields = {
    merchantId: '123456',
    userIp: '85.34.78.112',
    merchantOid: 'ORDER123',
    email: 'info@siteniz.com',
    paymentAmount: 10099,
    userBasket: basket,
    noInstallment: 0,
    maxInstallment: 0,
    currency: 'TL',
    testMode: true,
  }

  it('builds the iFrame API basket exactly like the documented sample', () => {
    expect(basket).toBe('W1siT3JuZWsgVXJ1biAxIiwiNTAuMDAiLDFdLFsiT3JuZWsgVXJ1biAyIiwiMzMuMjUiLDJdXQ==')
  })

  it('concatenates the fields in the documented order and appends the salt', () => {
    const input =
      '123456' + '85.34.78.112' + 'ORDER123' + 'info@siteniz.com' + '10099' + basket + '0' + '0' + 'TL' + '1' + SALT
    const reference = createHmac('sha256', KEY).update(input).digest('base64')
    expect(computeTokenHash(fields, SALT, KEY)).toBe(reference)
    expect(computeTokenHash(fields, SALT, KEY)).toBe('/iOJBzzbvpJZ0r2vdpLbKjIKR8mrI40yruCJ+zOmY6U=')
  })

  it('encodes test_mode as 1/0 and reacts to every input', () => {
    const hash = computeTokenHash(fields, SALT, KEY)
    expect(computeTokenHash({ ...fields, testMode: false }, SALT, KEY)).not.toBe(hash)
    expect(computeTokenHash({ ...fields, paymentAmount: 10098 }, SALT, KEY)).not.toBe(hash)
    expect(computeTokenHash({ ...fields, userIp: '85.34.78.113' }, SALT, KEY)).not.toBe(hash)
    expect(computeTokenHash(fields, 'OTHERSALT', KEY)).not.toBe(hash)
    expect(computeTokenHash(fields, SALT, 'OTHERKEYYY')).not.toBe(hash)
  })
})

describe('parsePaytrCallbackBody', () => {
  const body = (o: Record<string, string>) => new URLSearchParams(o).toString()

  it('parses a well-formed callback', () => {
    expect(
      parsePaytrCallbackBody(body({ merchant_oid: 'ORDER123', status: 'success', total_amount: '10099', hash: 'abc=' })),
    ).toEqual({ merchantOid: 'ORDER123', status: 'success', totalAmount: '10099', hash: 'abc=' })
  })

  it.each([
    ['missing oid', { status: 'success', total_amount: '1', hash: 'h' }],
    ['non-alphanumeric oid', { merchant_oid: 'A-1', status: 'success', total_amount: '1', hash: 'h' }],
    ['unknown status', { merchant_oid: 'A1', status: 'paid', total_amount: '1', hash: 'h' }],
    ['decimal amount', { merchant_oid: 'A1', status: 'success', total_amount: '1.5', hash: 'h' }],
    ['negative amount', { merchant_oid: 'A1', status: 'success', total_amount: '-1', hash: 'h' }],
    ['missing hash', { merchant_oid: 'A1', status: 'success', total_amount: '1' }],
  ])('returns null for %s', (_name, fields) => {
    expect(parsePaytrCallbackBody(body(fields))).toBeNull()
  })
})

describe('small helpers', () => {
  it('strips non-alphanumerics from the merchant_oid', () => {
    expect(toMerchantOid('3f2a-9b1c_77')).toBe('3f2a9b1c77')
  })

  it('maps currencies and rejects unsupported ones', () => {
    expect(toPaytrCurrency('try')).toBe('TL')
    expect(toPaytrCurrency('EUR')).toBe('EUR')
    expect(toPaytrCurrency('JPY')).toBeNull()
  })

  it('picks the first valid client IP in header priority order', () => {
    const headers: Record<string, string> = { 'x-forwarded-for': 'not-an-ip, 9.9.9.9', 'x-real-ip': '::ffff:1.2.3.4' }
    expect(pickClientIp((n) => headers[n])).toBe('1.2.3.4')
    expect(pickClientIp(() => null)).toBeNull()
  })

  it('masks secrets without revealing them and fingerprints deterministically', () => {
    expect(maskSecret('ABCDEFGHIJ')).toBe('••••••IJ')
    expect(maskSecret('short')).toBe('••••••')
    expect(maskSecret(null)).toBeNull()
    const creds = { merchantId: '123456', merchantKey: KEY, merchantSalt: SALT, testMode: true }
    expect(credentialFingerprint(creds)).toBe(credentialFingerprint({ ...creds }))
    expect(credentialFingerprint(creds)).not.toBe(credentialFingerprint({ ...creds, testMode: false }))
    expect(credentialFingerprint(creds)).not.toContain(KEY)
  })

  it('validates owner input and lets blank secrets fall back to stored ones', () => {
    const empty = validatePaytrInput(
      { merchantId: '', merchantKey: '', merchantSalt: '' },
      { hasKey: false, hasSalt: false },
    )
    expect(empty.errors).toEqual({ merchantId: 'required', merchantKey: 'required', merchantSalt: 'required' })

    const kept = validatePaytrInput(
      { merchantId: '123456', merchantKey: '', merchantSalt: '' },
      { hasKey: true, hasSalt: true },
    )
    expect(kept.errors).toEqual({})

    const bad = validatePaytrInput(
      { merchantId: '12 34', merchantKey: 'short', merchantSalt: 'has space in it' },
      { hasKey: true, hasSalt: true },
    )
    expect(bad.errors).toEqual({ merchantId: 'invalid', merchantKey: 'invalid', merchantSalt: 'invalid' })
  })
})
