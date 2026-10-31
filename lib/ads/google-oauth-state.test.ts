import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createGoogleOAuthState,
  createGooglePkcePair,
  googleOAuthCookieName,
  hashGoogleOAuthState,
  readGoogleOAuthFlowId,
  secureTextEquals,
  verifyGoogleOAuthState,
} from '@/lib/ads/google-oauth-state'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const FLOW_ID = '123e4567-e89b-42d3-a456-426614174000'
const SECRET = 'test-secret-with-at-least-thirty-two-characters'
const NOW = 1_800_000_000_000

describe('Google OAuth state and PKCE', () => {
  it('signs a short-lived, user-bound state and verifies its flow', () => {
    const created = createGoogleOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET, now: NOW })
    const claims = verifyGoogleOAuthState(created.state, SECRET, NOW)

    expect(claims).toMatchObject({ v: 1, sub: USER_ID, flow: FLOW_ID, nonce: created.nonce })
    expect(claims?.exp).toBe(Math.floor((NOW + 15 * 60_000) / 1000))
    expect(readGoogleOAuthFlowId(created.state)).toBe(FLOW_ID)
    expect(googleOAuthCookieName(FLOW_ID)).toBe(`gloval_ads_oauth_${FLOW_ID}`)
    expect(hashGoogleOAuthState(created.state)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects tampered, expired, and differently signed states', () => {
    const { state } = createGoogleOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: SECRET, now: NOW })
    const [payload, signature] = state.split('.')

    expect(verifyGoogleOAuthState(`${payload}.${signature.slice(1)}`, SECRET, NOW)).toBeNull()
    expect(verifyGoogleOAuthState(state, `${SECRET}-wrong`, NOW)).toBeNull()
    expect(verifyGoogleOAuthState(state, SECRET, NOW + 16 * 60_000)).toBeNull()
    expect(verifyGoogleOAuthState('not-a-state', SECRET, NOW)).toBeNull()
  })

  it('creates RFC 7636 S256 verifier and challenge values', () => {
    const pair = createGooglePkcePair()
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(pair.challenge).toBe(createHash('sha256').update(pair.verifier).digest('base64url'))
  })

  it('compares browser nonce values safely', () => {
    expect(secureTextEquals('same-nonce', 'same-nonce')).toBe(true)
    expect(secureTextEquals('same-nonce', 'other-nonce')).toBe(false)
    expect(secureTextEquals('short', 'longer')).toBe(false)
  })
})
