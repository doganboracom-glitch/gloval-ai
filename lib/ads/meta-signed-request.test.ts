import { describe, expect, it } from 'vitest'
import {
  newMetaDeletionConfirmationCode,
  parseMetaSignedRequest,
  signMetaSignedRequest,
} from '@/lib/ads/meta-signed-request'

const SECRET = 'meta-app-secret'
const NOW = 1_800_000_000_000

describe('Meta signed_request doğrulama', () => {
  it('geçerli imzayı çözer ve Meta kullanıcı kimliğini döner', () => {
    const signed = signMetaSignedRequest({ user_id: '1234567890', issued_at: NOW / 1000 }, SECRET)
    expect(parseMetaSignedRequest(signed, SECRET, NOW)).toEqual({ userId: '1234567890', issuedAt: NOW / 1000 })
  })

  it('sayısal user_id değerini metne çevirir', () => {
    const signed = signMetaSignedRequest({ user_id: 4242 }, SECRET)
    expect(parseMetaSignedRequest(signed, SECRET, NOW)?.userId).toBe('4242')
  })

  it('bozuk imzayı reddeder', () => {
    const signed = signMetaSignedRequest({ user_id: '1234567890' }, SECRET)
    const [, payload] = signed.split('.')
    expect(parseMetaSignedRequest(`AAAA${signed.slice(4)}`, SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest(`${'x'.repeat(43)}.${payload}`, SECRET, NOW)).toBeNull()
  })

  it('yanlış uygulama sırrıyla imzalanmışı reddeder', () => {
    const signed = signMetaSignedRequest({ user_id: '1234567890' }, 'attacker-secret')
    expect(parseMetaSignedRequest(signed, SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest(signed, '', NOW)).toBeNull()
  })

  it('yük değiştirilirse imza tutmaz', () => {
    const signed = signMetaSignedRequest({ user_id: '1234567890' }, SECRET)
    const [signature] = signed.split('.')
    const forged = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '9999999999' })).toString('base64url')
    expect(parseMetaSignedRequest(`${signature}.${forged}`, SECRET, NOW)).toBeNull()
  })

  it('HMAC-SHA256 dışındaki algoritmayı reddeder', () => {
    const signed = signMetaSignedRequest({ user_id: '1234567890', algorithm: 'HMAC-SHA1' }, SECRET)
    expect(parseMetaSignedRequest(signed, SECRET, NOW)).toBeNull()
    const none = signMetaSignedRequest({ user_id: '1234567890', algorithm: 'none' }, SECRET)
    expect(parseMetaSignedRequest(none, SECRET, NOW)).toBeNull()
  })

  it('24 saatten eski veya gelecekteki issued_at değerini reddeder', () => {
    const old = signMetaSignedRequest({ user_id: '1234567890', issued_at: NOW / 1000 - 25 * 3600 }, SECRET)
    const future = signMetaSignedRequest({ user_id: '1234567890', issued_at: NOW / 1000 + 25 * 3600 }, SECRET)
    const fresh = signMetaSignedRequest({ user_id: '1234567890', issued_at: NOW / 1000 - 3600 }, SECRET)
    expect(parseMetaSignedRequest(old, SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest(future, SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest(fresh, SECRET, NOW)).not.toBeNull()
  })

  it('rakam olmayan veya eksik user_id değerini reddeder', () => {
    expect(parseMetaSignedRequest(signMetaSignedRequest({ user_id: '12ab' }, SECRET), SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest(signMetaSignedRequest({}, SECRET), SECRET, NOW)).toBeNull()
  })

  it('metin olmayan, boş, çok uzun veya yanlış biçimli girdiyi reddeder', () => {
    expect(parseMetaSignedRequest(null, SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest('', SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest('a.b.c', SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest('onlyonepart', SECRET, NOW)).toBeNull()
    expect(parseMetaSignedRequest('a'.repeat(9000), SECRET, NOW)).toBeNull()
  })

  it('silme onay kodu 32 karakterlik rastgele onaltılıktır', () => {
    const a = newMetaDeletionConfirmationCode()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newMetaDeletionConfirmationCode()).not.toBe(a)
  })
})
