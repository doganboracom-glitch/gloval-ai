import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  IYZICO_ONBOARDING_URL,
  IYZICO_CAMPAIGN_COPY,
  buildIyzicoInstantHeaders,
  classifyIyzicoStatus,
  isIyzicoCampaignEnabled,
  normalizeIyzicoPhone,
  readIyzicoInstantCredentials,
  signIyzicoInstant,
  validateIyzicoInstantInput,
} from './iyzico-onboarding-shared'

const FAKE = { developerKey: 'fake-dev-key', applicationName: 'fake-app', saltKey: 'fake-salt' }

describe('campaign copy and flag', () => {
  it('carries the exact, complete Turkish disclosure', () => {
    expect(IYZICO_CAMPAIGN_COPY.tr).toBe(
      "iyzico kampanyası: 7 gün vade ve %2,29 komisyon oranı; yalnızca tek çekim, Türk kartı işlemleri için, canlıya geçilen ay ve sonraki 3 ay geçerlidir. Kampanya koşulları iyzico'ya aittir ve iyzico tarafından değiştirilebilir.",
    )
  })

  it.each(['tr', 'en'] as const)('never claims the rate is unlimited in time (%s)', (lang) => {
    expect(IYZICO_CAMPAIGN_COPY[lang].toLowerCase()).not.toMatch(/süresiz|unlimited|lifetime|forever|permanent/)
  })

  it('is off by default and only the exact string "true" turns it on', () => {
    expect(isIyzicoCampaignEnabled({})).toBe(false)
    expect(isIyzicoCampaignEnabled({ IYZICO_INSTANT_SHOW_CAMPAIGN: '' })).toBe(false)
    expect(isIyzicoCampaignEnabled({ IYZICO_INSTANT_SHOW_CAMPAIGN: '1' })).toBe(false)
    expect(isIyzicoCampaignEnabled({ IYZICO_INSTANT_SHOW_CAMPAIGN: 'TRUE' })).toBe(false)
    expect(isIyzicoCampaignEnabled({ IYZICO_INSTANT_SHOW_CAMPAIGN: 'true' })).toBe(true)
  })

  it('keeps the payload to name, surname, phone and email only (no domain)', () => {
    const result = validateIyzicoInstantInput({
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      email: 'a@b.com',
      phone: '0532 123 45 67',
    })
    expect(result.ok && Object.keys(result.payload).sort()).toEqual(
      ['contactName', 'contactSurname', 'gsmNumber', 'registrationEmail'],
    )
  })
})

describe('normalizeIyzicoPhone', () => {
  it.each([
    ['0532 123 45 67', '+905321234567'],
    ['532-123-45-67', '+905321234567'],
    ['+90 532 123 45 67', '+905321234567'],
    ['905321234567', '+905321234567'],
    ['(0532) 123 45 67', '+905321234567'],
    ['00905321234567', '+905321234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIyzicoPhone(input)).toBe(expected)
  })

  it.each(['', 'abc', '0212 123 45 67', '+44 7700 900123', '53212345', '05321234567890', null, 42])(
    'rejects %s',
    (input) => {
      expect(normalizeIyzicoPhone(input)).toBeNull()
    },
  )
})

describe('validateIyzicoInstantInput', () => {
  const valid = { firstName: ' Ayşe ', lastName: 'Yılmaz', email: ' Ayse@Example.com ', phone: '0532 123 45 67' }

  it('builds the exact four-field payload', () => {
    const result = validateIyzicoInstantInput(valid)
    expect(result).toEqual({
      ok: true,
      payload: {
        contactName: 'Ayşe',
        contactSurname: 'Yılmaz',
        registrationEmail: 'ayse@example.com',
        gsmNumber: '+905321234567',
      },
    })
  })

  it('reports field-based errors', () => {
    expect(validateIyzicoInstantInput({ ...valid, firstName: ' ' })).toEqual({ ok: false, error: 'invalid_name' })
    expect(validateIyzicoInstantInput({ ...valid, lastName: 'x'.repeat(81) })).toEqual({ ok: false, error: 'invalid_name' })
    expect(validateIyzicoInstantInput({ ...valid, email: 'nope' })).toEqual({ ok: false, error: 'invalid_email' })
    expect(validateIyzicoInstantInput({ ...valid, phone: '123' })).toEqual({ ok: false, error: 'invalid_phone' })
  })
})

describe('signing: known vector', () => {
  // Expected value computed independently (Python hmac/hashlib), same formula as
  // the Postman example: HMAC-SHA256(saltKey, developerKey|applicationName|randomKey).
  const randomKey = '0123456789abcdef0123456789abcdef'
  const expected = '056df9d9901a92fcadb6e6d43e972e3c0548b1042542dec9d0d1f2e76f6d3e5c'

  it('produces the expected lowercase hex digest', () => {
    expect(signIyzicoInstant('devKey123', 'myApp', randomKey, 'saltSecret456')).toBe(expected)
  })

  it('changes when any input changes', () => {
    expect(signIyzicoInstant('devKey124', 'myApp', randomKey, 'saltSecret456')).not.toBe(expected)
    expect(signIyzicoInstant('devKey123', 'myApp2', randomKey, 'saltSecret456')).not.toBe(expected)
    expect(signIyzicoInstant('devKey123', 'myApp', randomKey + '0', 'saltSecret456')).not.toBe(expected)
    expect(signIyzicoInstant('devKey123', 'myApp', randomKey, 'saltSecret457')).not.toBe(expected)
  })

  it('sends exactly the three signed headers plus content-type with a 32-hex random key', () => {
    const headers = buildIyzicoInstantHeaders({ developerKey: 'devKey123', applicationName: 'myApp', saltKey: 'saltSecret456' })
    expect(Object.keys(headers).sort()).toEqual(['content-type', 'x-iyzi-app-name', 'x-iyzi-developer-key-v2', 'x-iyzi-rnd'])
    expect(headers['x-iyzi-rnd']).toMatch(/^[0-9a-f]{32}$/)
    expect(headers['x-iyzi-developer-key-v2']).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('classifyIyzicoStatus', () => {
  it('classifies by status code only', () => {
    expect(classifyIyzicoStatus(200)).toEqual({ ok: true })
    expect(classifyIyzicoStatus(204)).toEqual({ ok: true })
    expect(classifyIyzicoStatus(400)).toEqual({ ok: false, error: 'rejected', code: 'iyzico_http_400' })
    expect(classifyIyzicoStatus(422)).toMatchObject({ error: 'rejected' })
    expect(classifyIyzicoStatus(401)).toMatchObject({ error: 'unavailable' })
    expect(classifyIyzicoStatus(500)).toEqual({ ok: false, error: 'unavailable', code: 'iyzico_http_500' })
  })
})

describe('signing', () => {
  it('matches HMAC-SHA256 hex over key|app|random with the salt as key', () => {
    const expected = createHmac('sha256', 'fake-salt').update('fake-dev-key|fake-app|rnd123').digest('hex')
    expect(signIyzicoInstant('fake-dev-key', 'fake-app', 'rnd123', 'fake-salt')).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses a fresh random value per request and never leaks secrets in headers', () => {
    const a = buildIyzicoInstantHeaders(FAKE)
    const b = buildIyzicoInstantHeaders(FAKE)
    expect(a['x-iyzi-rnd']).not.toBe(b['x-iyzi-rnd'])
    expect(a['x-iyzi-app-name']).toBe('fake-app')
    expect(a['x-iyzi-developer-key-v2']).toBe(
      signIyzicoInstant('fake-dev-key', 'fake-app', a['x-iyzi-rnd'], 'fake-salt'),
    )
    const serialized = JSON.stringify(a)
    expect(serialized).not.toContain('fake-salt')
    expect(serialized).not.toContain('fake-dev-key')
  })

  it('targets the fixed onboarding host', () => {
    expect(IYZICO_ONBOARDING_URL).toBe('https://onboarding.iyzipay.com/api/v1/merchants')
  })
})

describe('readIyzicoInstantCredentials', () => {
  const full = {
    IYZICO_INSTANT_DEVELOPER_KEY: 'fake-dev-key',
    IYZICO_INSTANT_APP_NAME: 'fake-app',
    IYZICO_INSTANT_SALT_KEY: 'fake-salt',
  }

  it('returns credentials when all three are set', () => {
    expect(readIyzicoInstantCredentials(full)).toEqual(FAKE)
  })

  it('is disabled when any is missing', () => {
    for (const key of Object.keys(full)) {
      expect(readIyzicoInstantCredentials({ ...full, [key]: undefined })).toBeNull()
      expect(readIyzicoInstantCredentials({ ...full, [key]: '' })).toBeNull()
    }
  })
})
