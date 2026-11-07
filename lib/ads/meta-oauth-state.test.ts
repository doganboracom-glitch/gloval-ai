import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import {
  META_OAUTH_COOKIE_PREFIX,
  META_OAUTH_STATE_TTL_MS,
  createMetaOAuthState,
  hashMetaOAuthState,
  metaOAuthCookieName,
  metaTokenContext,
  readMetaOAuthFlowId,
  secureMetaTextEquals,
  verifyMetaOAuthState,
} from '@/lib/ads/meta-oauth-state'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const FLOW_ID = '987e6543-e21b-42d3-a456-426614174000'
const SECRET = 'meta-state-secret-with-at-least-thirty-two-characters'

function forge(claims: Record<string, unknown>, secret = SECRET) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

describe('Meta OAuth state', () => {
  it('geçerli state kullanıcı, akış ve nonce bilgisini taşır', () => {
    const created = createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET })
    const claims = verifyMetaOAuthState(created.state, SECRET)
    expect(claims).toMatchObject({ v: 1, aud: 'meta', sub: USER_ID, flow: FLOW_ID, nonce: created.nonce })
  })

  it('süresi dolan state reddedilir', () => {
    const now = Date.now()
    const created = createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET, now })
    expect(verifyMetaOAuthState(created.state, SECRET, now + META_OAUTH_STATE_TTL_MS - 5_000)).not.toBeNull()
    expect(verifyMetaOAuthState(created.state, SECRET, now + META_OAUTH_STATE_TTL_MS + 1_000)).toBeNull()
  })

  it('gelecekte aşırı uzun süreli state reddedilir', () => {
    const exp = Math.floor((Date.now() + 3 * META_OAUTH_STATE_TTL_MS) / 1000)
    const state = forge({ v: 1, aud: 'meta', sub: USER_ID, flow: FLOW_ID, nonce: 'a'.repeat(43), exp })
    expect(verifyMetaOAuthState(state, SECRET)).toBeNull()
  })

  it('yanlış gizli anahtarla imzalanan veya kurcalanan state reddedilir', () => {
    const created = createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET })
    expect(verifyMetaOAuthState(created.state, 'another-secret-with-at-least-thirty-two-chars')).toBeNull()
    const [payload, signature] = created.state.split('.')
    const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: '123e4567-e89b-42d3-a456-426614174000' })).toString('base64url')
    expect(verifyMetaOAuthState(`${tampered}.${signature}`, SECRET)).toBeNull()
    expect(verifyMetaOAuthState(`${created.state}.extra`, SECRET)).toBeNull()
  })

  it('Google için üretilmiş (aud farklı) state Meta tarafında kullanılamaz', () => {
    const exp = Math.floor((Date.now() + 60_000) / 1000)
    const state = forge({ v: 1, aud: 'google', sub: USER_ID, flow: FLOW_ID, nonce: 'a'.repeat(43), exp })
    expect(verifyMetaOAuthState(state, SECRET)).toBeNull()
  })

  it('kısa gizli anahtar ve geçersiz kimlikler state üretimini engeller', () => {
    expect(() => createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: 'short' })).toThrow(MetaAdsError)
    expect(() => createMetaOAuthState({ userId: 'x', flowId: FLOW_ID, secret: SECRET })).toThrow(MetaAdsError)
    expect(verifyMetaOAuthState('', SECRET)).toBeNull()
    expect(verifyMetaOAuthState('x'.repeat(3000), SECRET)).toBeNull()
  })

  it('her state benzersiz nonce üretir (tekrar kullanım ayırt edilebilir)', () => {
    const a = createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET })
    const b = createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET })
    expect(a.nonce).not.toBe(b.nonce)
    expect(hashMetaOAuthState(a.state)).not.toBe(hashMetaOAuthState(b.state))
    expect(hashMetaOAuthState(a.state)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('çerez nonce karşılaştırması yalnızca birebir eşleşmeyi kabul eder', () => {
    const created = createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET })
    expect(secureMetaTextEquals(created.nonce, created.nonce)).toBe(true)
    expect(secureMetaTextEquals(created.nonce, `${created.nonce.slice(0, -1)}x`)).toBe(false)
    expect(secureMetaTextEquals(created.nonce, '')).toBe(false)
    expect(secureMetaTextEquals(created.nonce, `${created.nonce}extra`)).toBe(false)
  })

  it('akış kimliği imzasız okunur ama yalnızca geçerli UUID döner', () => {
    const created = createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET })
    expect(readMetaOAuthFlowId(created.state)).toBe(FLOW_ID)
    expect(readMetaOAuthFlowId('garbage')).toBeNull()
    expect(readMetaOAuthFlowId(forge({ flow: '../../etc' }))).toBeNull()
  })

  it('çerez adı akışa bağlıdır ve geçersiz kimliği reddeder', () => {
    expect(metaOAuthCookieName(FLOW_ID)).toBe(`${META_OAUTH_COOKIE_PREFIX}${FLOW_ID}`)
    expect(() => metaOAuthCookieName('bad')).toThrow(MetaAdsError)
  })

  it('token bağlamı akış kimliğine bağlıdır', () => {
    expect(metaTokenContext(USER_ID, FLOW_ID)).toEqual({ userId: USER_ID, platform: 'meta', externalAccountId: `oauth:${FLOW_ID}` })
  })
})
