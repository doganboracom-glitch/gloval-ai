import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  AdsTokenCryptoError,
  adsTokenKeyVersion,
  adsTokenNeedsRotation,
  decryptAdsToken,
  encryptAdsToken,
  loadAdsTokenKeyring,
} from '@/lib/ads/token-crypto'

const key = () => randomBytes(32).toString('base64')
const ctx = { userId: 'user-1', platform: 'google_ads', externalAccountId: '123-456-7890' }

describe('ads token crypto', () => {
  const env = { ADS_TOKEN_ENC_ACTIVE_VERSION: '1', ADS_TOKEN_ENC_KEY_V1: key() }
  const ring = loadAdsTokenKeyring(env)

  it('round-trips and never stores plaintext in the envelope', () => {
    const { ciphertext, keyVersion } = encryptAdsToken('1//refresh-token-secret', ctx, ring)
    expect(keyVersion).toBe(1)
    expect(ciphertext).toMatch(/^v1:/)
    expect(ciphertext).not.toContain('refresh-token-secret')
    expect(decryptAdsToken(ciphertext, ctx, ring)).toBe('1//refresh-token-secret')
  })

  it('uses a fresh IV per encryption', () => {
    const a = encryptAdsToken('same', ctx, ring).ciphertext
    const b = encryptAdsToken('same', ctx, ring).ciphertext
    expect(a).not.toBe(b)
  })

  it('binds the ciphertext to its user, platform and account', () => {
    const { ciphertext } = encryptAdsToken('secret', ctx, ring)
    for (const other of [
      { ...ctx, userId: 'user-2' },
      { ...ctx, platform: 'meta' },
      { ...ctx, externalAccountId: '999' },
    ]) {
      expect(() => decryptAdsToken(ciphertext, other, ring)).toThrow(AdsTokenCryptoError)
    }
  })

  it('detects tampering and malformed envelopes without echoing the content', () => {
    const { ciphertext } = encryptAdsToken('secret', ctx, ring)
    const parts = ciphertext.split(':')
    parts[3] = Buffer.from('tampered-bytes').toString('base64url')
    expect(() => decryptAdsToken(parts.join(':'), ctx, ring)).toThrow('token could not be decrypted')
    expect(() => decryptAdsToken('garbage', ctx, ring)).toThrow('malformed token envelope')
  })

  it('rejects empty plaintext', () => {
    expect(() => encryptAdsToken('', ctx, ring)).toThrow(AdsTokenCryptoError)
  })

  it('supports rotation: old ciphertext still decrypts and is flagged for re-encryption', () => {
    const k1 = key()
    const k2 = key()
    const oldRing = loadAdsTokenKeyring({ ADS_TOKEN_ENC_ACTIVE_VERSION: '1', ADS_TOKEN_ENC_KEY_V1: k1 })
    const rotated = loadAdsTokenKeyring({
      ADS_TOKEN_ENC_ACTIVE_VERSION: '2',
      ADS_TOKEN_ENC_KEY_V1: k1,
      ADS_TOKEN_ENC_KEY_V2: k2,
    })
    const { ciphertext } = encryptAdsToken('secret', ctx, oldRing)
    expect(adsTokenKeyVersion(ciphertext)).toBe(1)
    expect(adsTokenNeedsRotation(ciphertext, rotated)).toBe(true)
    expect(decryptAdsToken(ciphertext, ctx, rotated)).toBe('secret')

    const fresh = encryptAdsToken('secret', ctx, rotated)
    expect(fresh.keyVersion).toBe(2)
    expect(adsTokenNeedsRotation(fresh.ciphertext, rotated)).toBe(false)
    // Once V1 is dropped, rows still on V1 can no longer be read.
    const dropped = loadAdsTokenKeyring({ ADS_TOKEN_ENC_ACTIVE_VERSION: '2', ADS_TOKEN_ENC_KEY_V2: k2 })
    expect(() => decryptAdsToken(ciphertext, ctx, dropped)).toThrow(/no key for version 1/)
  })

  it('refuses to load without a valid active version or key', () => {
    expect(() => loadAdsTokenKeyring({})).toThrow(/ADS_TOKEN_ENC_ACTIVE_VERSION/)
    expect(() => loadAdsTokenKeyring({ ADS_TOKEN_ENC_ACTIVE_VERSION: '0' })).toThrow(/positive integer/)
    expect(() => loadAdsTokenKeyring({ ADS_TOKEN_ENC_ACTIVE_VERSION: '1' })).toThrow(/ADS_TOKEN_ENC_KEY_V1 is not configured/)
    expect(() =>
      loadAdsTokenKeyring({ ADS_TOKEN_ENC_ACTIVE_VERSION: '1', ADS_TOKEN_ENC_KEY_V1: 'c2hvcnQ=' }),
    ).toThrow(/32-byte/)
  })

  it('rejects auth tags that are not exactly 16 bytes as malformed', () => {
    const { ciphertext } = encryptAdsToken('secret', ctx, ring)
    const parts = ciphertext.split(':')
    const tag = Buffer.from(parts[2], 'base64url')
    expect(tag.length).toBe(16)

    for (const badTag of [tag.subarray(0, 4), tag.subarray(0, 8), tag.subarray(0, 15), Buffer.concat([tag, Buffer.from([0])])]) {
      const forged = [parts[0], parts[1], badTag.toString('base64url'), parts[3]].join(':')
      expect(() => decryptAdsToken(forged, ctx, ring)).toThrow('malformed token envelope')
      expect(() => decryptAdsToken(forged, ctx, ring)).toThrow(AdsTokenCryptoError)
    }
    expect(decryptAdsToken(ciphertext, ctx, ring)).toBe('secret')
  })

  it('does not put key material or plaintext in error messages', () => {
    const bad = 'c2hvcnQ='
    const badLoad = () => loadAdsTokenKeyring({ ADS_TOKEN_ENC_ACTIVE_VERSION: '1', ADS_TOKEN_ENC_KEY_V1: bad })
    expect(badLoad).toThrow(AdsTokenCryptoError)
    expect(badLoad).toThrow(/32-byte/)
    expect(badLoad).not.toThrow(bad)

    const k = key()
    const secret = 'plaintext-refresh-token'
    const localRing = loadAdsTokenKeyring({ ADS_TOKEN_ENC_ACTIVE_VERSION: '1', ADS_TOKEN_ENC_KEY_V1: k })
    const { ciphertext } = encryptAdsToken(secret, ctx, localRing)
    const wrongCtx = () => decryptAdsToken(ciphertext, { ...ctx, userId: 'someone-else' }, localRing)
    expect(wrongCtx).toThrow('token could not be decrypted')
    expect(wrongCtx).not.toThrow(secret)
    expect(wrongCtx).not.toThrow(k)

    const empty = () => encryptAdsToken('', ctx, localRing)
    expect(empty).toThrow(AdsTokenCryptoError)
    expect(empty).not.toThrow(k)
  })
})
