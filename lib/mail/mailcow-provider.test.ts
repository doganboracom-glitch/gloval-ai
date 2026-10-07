import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MailDomain } from './types'

const customDomain: MailDomain = {
  id: '5f0c1d52-3a41-4a0e-9c1b-0d7a8e2f6b11',
  userId: 'user-1',
  domain: 'example.com.tr',
  status: 'active',
  dns: [],
  createdAt: '2026-01-01T00:00:00.000Z',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function loadProvider() {
  vi.resetModules()
  vi.stubEnv('MAILCOW_API_URL', 'https://mail.test')
  vi.stubEnv('MAILCOW_API_KEY', 'test-key')
  return (await import('./mailcow-provider')).mailcowProvider
}

describe('mailcowProvider', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('treats the `{}` Mailcow returns for an empty list as no rows', async () => {
    const provider = await loadProvider()
    fetchMock.mockImplementation(async () => json({}))

    await expect(provider.listMailboxes('example.com.tr')).resolves.toEqual([])
    await expect(provider.listAliases('example.com.tr')).resolves.toEqual([])
  })

  it('re-keys a provisioned custom domain by hostname, which Mailcow addresses it by', async () => {
    const provider = await loadProvider()
    fetchMock.mockImplementation(async () => json([{ type: 'success', msg: ['domain_added', 'example.com.tr'] }]))

    const ensured = await provider.ensureDomain!(customDomain)

    expect(ensured.id).toBe('example.com.tr')
    expect(ensured.userId).toBe('user-1')
  })

  it('tolerates a domain that already exists on the server', async () => {
    const provider = await loadProvider()
    fetchMock.mockImplementation(async () => json([{ type: 'danger', msg: 'domain_exists' }]))

    await expect(provider.ensureDomain!(customDomain)).resolves.toMatchObject({ id: 'example.com.tr' })
  })

  it('surfaces a rejected write instead of treating HTTP 200 as success', async () => {
    const provider = await loadProvider()
    fetchMock.mockImplementation(async () => json([{ type: 'danger', msg: 'access_denied' }]))

    await expect(provider.ensureDomain!(customDomain)).rejects.toThrow(/access_denied/)
  })
})
