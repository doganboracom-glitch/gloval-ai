// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signMetaSignedRequest } from '@/lib/ads/meta-signed-request'

const mocks = vi.hoisted(() => ({ revoke: vi.fn() }))

vi.mock('@/lib/ads/meta-connections', () => ({
  revokeMetaConnectionsForMetaUser: (...args: unknown[]) => mocks.revoke(...args),
}))

import { META_DATA_DELETION_STATUS_URL, POST } from './route'

const APP_SECRET = 'meta-app-secret'

function formRequest(signedRequest: string | null) {
  const body = new URLSearchParams()
  if (signedRequest !== null) body.set('signed_request', signedRequest)
  return new Request('https://gloval.ai/api/ads/meta/data-deletion', {
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
  mocks.revoke.mockResolvedValue(1)
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/ads/meta/data-deletion', () => {
  it('revokes the user and returns the status url plus confirmation code Meta requires', async () => {
    const response = await POST(formRequest(signMetaSignedRequest({ user_id: '4242424242' }, APP_SECRET)))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(typeof body.confirmation_code).toBe('string')
    expect(body.confirmation_code.length).toBeGreaterThanOrEqual(16)
    expect(body.url).toBe(`${META_DATA_DELETION_STATUS_URL}?code=${body.confirmation_code}`)
    expect(mocks.revoke).toHaveBeenCalledWith('4242424242', body.confirmation_code)
  })

  it('issues a different confirmation code for every request', async () => {
    const signed = signMetaSignedRequest({ user_id: '4242424242' }, APP_SECRET)
    const first = await (await POST(formRequest(signed))).json()
    const second = await (await POST(formRequest(signed))).json()

    expect(first.confirmation_code).not.toBe(second.confirmation_code)
  })

  it('rejects a forged signature without revoking anything', async () => {
    const response = await POST(formRequest(signMetaSignedRequest({ user_id: '4242424242' }, 'attacker-secret')))

    expect(response.status).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('rejects a missing signed_request', async () => {
    expect((await POST(formRequest(null))).status).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('answers 503 and no confirmation code when the revoke fails', async () => {
    mocks.revoke.mockRejectedValue(new Error('db down'))
    const response = await POST(formRequest(signMetaSignedRequest({ user_id: '4242424242' }, APP_SECRET)))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'provider_error' })
  })
})
