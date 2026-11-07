// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signMetaSignedRequest } from '@/lib/ads/meta-signed-request'

const mocks = vi.hoisted(() => ({ revoke: vi.fn() }))

vi.mock('@/lib/ads/meta-connections', () => ({
  revokeMetaConnectionsForMetaUser: (...args: unknown[]) => mocks.revoke(...args),
}))

import { POST } from './route'

const APP_SECRET = 'meta-app-secret'

function formRequest(signedRequest: string | null) {
  const body = new URLSearchParams()
  if (signedRequest !== null) body.set('signed_request', signedRequest)
  return new Request('https://gloval.ai/api/ads/meta/deauthorize', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('META_APP_ID', '1234567890')
  vi.stubEnv('META_APP_SECRET', APP_SECRET)
  vi.stubEnv('ADS_OAUTH_STATE_SECRET', 'test-state-secret-with-at-least-thirty-two-characters')
  vi.stubEnv('META_ADS_ACCESS_MODE', 'off')
  mocks.revoke.mockResolvedValue(2)
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/ads/meta/deauthorize', () => {
  it('revokes every connection of the signed Meta user, even when the access mode is off', async () => {
    const response = await POST(formRequest(signMetaSignedRequest({ user_id: '4242424242' }, APP_SECRET)))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.revoke).toHaveBeenCalledWith('4242424242', null)
  })

  it('rejects a signature made with another secret', async () => {
    const response = await POST(formRequest(signMetaSignedRequest({ user_id: '4242424242' }, 'attacker-secret')))

    expect(response.status).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('rejects a missing signed_request', async () => {
    const response = await POST(formRequest(null))

    expect(response.status).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('rejects a body that is not form data', async () => {
    const response = await POST(new Request('https://gloval.ai/api/ads/meta/deauthorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))

    expect(response.status).toBe(400)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('answers 503 when the Meta app is not configured', async () => {
    vi.stubEnv('META_APP_SECRET', '')
    const response = await POST(formRequest(signMetaSignedRequest({ user_id: '4242424242' }, APP_SECRET)))

    expect(response.status).toBe(503)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('answers 503 so Meta retries when the revoke fails', async () => {
    mocks.revoke.mockRejectedValue(new Error('db down'))
    const response = await POST(formRequest(signMetaSignedRequest({ user_id: '4242424242' }, APP_SECRET)))

    expect(response.status).toBe(503)
  })
})
