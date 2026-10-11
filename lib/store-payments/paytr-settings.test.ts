import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  tables: {} as Record<string, Row[]>,
  upsert: null as null | ((values: Row) => void),
  testConnection: null as null | (() => unknown),
}))

/** Tiny in-memory Supabase builder shared by the "user" and "service role" clients. */
function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from(table: string) {
      const filters: [string, unknown][] = []
      const rows = () => (state.tables[table] ??= [])
      const api = {
        select: () => api,
        eq: (column: string, value: unknown) => {
          filters.push([column, value])
          return api
        },
        maybeSingle: async () => {
          const hit = rows().find((r) => filters.every(([c, v]) => r[c] === v))
          return { data: hit ? { ...hit } : null, error: null }
        },
        upsert: async (values: Row) => {
          state.upsert?.(values)
          const list = rows()
          const index = list.findIndex((r) => r.project_id === values.project_id)
          if (index >= 0) list[index] = { ...list[index], ...values }
          else list.push({ ...values })
          return { error: null }
        },
      }
      return api
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-real-ip': '203.0.113.7' }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient() }))
vi.mock('@/lib/store-payments/paytr-client', () => ({
  testPaytrCredentials: vi.fn(async () => {
    state.testConnection?.()
    return { ok: true }
  }),
}))

import { PaytrPanel } from '@/components/ecommerce/paytr-panel'
import { testPaytrCredentials } from '@/lib/store-payments/paytr-client'
import { credentialFingerprint } from '@/lib/store-payments/paytr-core'
import {
  disconnectPaytr,
  getPaytrSettings,
  savePaytrSettings,
  testPaytrConnection,
} from '@/lib/store-payments/paytr-settings'

const PROJECT_A = 'project-a'
const OWNER_A = { id: 'owner-a', email: 'a@example.com' }
const OWNER_B = { id: 'owner-b', email: 'b@example.com' }

const MERCHANT_ID = '123456'
const MERCHANT_KEY = 'SuperSecretMerchantKey-9f8e7d'
const MERCHANT_SALT = 'SuperSecretMerchantSalt-1a2b3c'

const settingsRow = () => state.tables.ecommerce_payment_settings?.find((r) => r.project_id === PROJECT_A)

const secretsLeaked = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.includes(MERCHANT_KEY) || text.includes(MERCHANT_SALT)
}

beforeAll(() => {
  process.env.PAYMENT_ENCRYPTION_KEY = 'unit-test-encryption-seed'
  process.env.ADMIN_EMAILS = 'platform-admin@example.com'
})

beforeEach(() => {
  state.user = OWNER_A
  state.upsert = null
  state.testConnection = null
  state.tables = {
    projects: [
      { id: PROJECT_A, owner_id: OWNER_A.id, slug: 'store-a' },
      { id: 'project-b', owner_id: OWNER_B.id, slug: 'store-b' },
    ],
    ecommerce_payment_settings: [],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network access is not allowed in unit tests')
    }),
  )
  vi.mocked(testPaytrCredentials).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function ownerSavesCredentials() {
  const result = await savePaytrSettings(PROJECT_A, {
    merchantId: MERCHANT_ID,
    merchantKey: MERCHANT_KEY,
    merchantSalt: MERCHANT_SALT,
    testMode: true,
    enabled: false,
  })
  expect(result.ok).toBe(true)
  return result
}

describe('PayTR settings: owner access control', () => {
  it('the owner can save and read their own settings', async () => {
    await ownerSavesCredentials()
    const view = await getPaytrSettings(PROJECT_A)
    expect(view.merchantId).toBe(MERCHANT_ID)
    expect(view.maskedKey).toMatch(/^••••••/)
    expect(view.maskedSalt).toMatch(/^••••••/)
  })

  it('another store\u2019s owner cannot read the settings', async () => {
    await ownerSavesCredentials()
    state.user = OWNER_B
    await expect(getPaytrSettings(PROJECT_A)).rejects.toThrow('NOT_FOUND')
  })

  it('another store\u2019s owner cannot write, test or disconnect, and nothing changes', async () => {
    await ownerSavesCredentials()
    const before = JSON.stringify(settingsRow())
    const upsert = vi.fn()
    state.upsert = upsert

    state.user = OWNER_B
    await expect(
      savePaytrSettings(PROJECT_A, {
        merchantId: '999999',
        merchantKey: 'AttackerChosenKey-123',
        merchantSalt: 'AttackerChosenSalt-123',
        testMode: false,
        enabled: false,
      }),
    ).rejects.toThrow('NOT_FOUND')
    await expect(testPaytrConnection(PROJECT_A)).rejects.toThrow('NOT_FOUND')
    await expect(disconnectPaytr(PROJECT_A)).rejects.toThrow('NOT_FOUND')

    expect(upsert).not.toHaveBeenCalled()
    expect(JSON.stringify(settingsRow())).toBe(before)
    expect(testPaytrCredentials).not.toHaveBeenCalled()
  })

  it('a signed-out caller is rejected', async () => {
    state.user = null
    await expect(getPaytrSettings(PROJECT_A)).rejects.toThrow('UNAUTHENTICATED')
    await expect(disconnectPaytr(PROJECT_A)).rejects.toThrow('UNAUTHENTICATED')
  })

  it('a platform admin on the allow-list may access any store', async () => {
    await ownerSavesCredentials()
    state.user = { id: 'admin-user', email: 'Platform-Admin@example.com' }
    const view = await getPaytrSettings(PROJECT_A)
    expect(view.merchantId).toBe(MERCHANT_ID)
  })
})

describe('PayTR settings: secrets never leave the server', () => {
  it('no action response contains the Merchant Key or Salt', async () => {
    const saved = await ownerSavesCredentials()
    const read = await getPaytrSettings(PROJECT_A)
    const tested = await testPaytrConnection(PROJECT_A)
    const enabled = await savePaytrSettings(PROJECT_A, {
      merchantId: MERCHANT_ID,
      merchantKey: '',
      merchantSalt: '',
      testMode: true,
      enabled: true,
    })
    const invalid = await savePaytrSettings(PROJECT_A, {
      merchantId: MERCHANT_ID,
      merchantKey: 'bad key with spaces',
      merchantSalt: '',
      testMode: true,
      enabled: false,
    })
    const disconnected = await disconnectPaytr(PROJECT_A)

    expect(tested.ok).toBe(true)
    expect(enabled.ok).toBe(true)
    expect(invalid.ok).toBe(false)
    expect(disconnected.ok).toBe(true)
    for (const response of [saved, read, tested, enabled, invalid, disconnected]) {
      expect(secretsLeaked(response)).toBe(false)
    }
    expect(tested.ok && tested.view.tested).toBe(true)
    expect(enabled.ok && enabled.view.enabled).toBe(true)
  })

  it('an invalid-input response does not echo the submitted secret back', async () => {
    const typedKey = 'bad key typed by owner'
    const result = await savePaytrSettings(PROJECT_A, {
      merchantId: MERCHANT_ID,
      merchantKey: typedKey,
      merchantSalt: MERCHANT_SALT,
      testMode: true,
      enabled: false,
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain(typedKey)
  })

  it('secrets are stored encrypted, not as plaintext, and the test never touches the network', async () => {
    await ownerSavesCredentials()
    await testPaytrConnection(PROJECT_A)
    const row = settingsRow()
    expect(typeof row?.secret_encrypted).toBe('string')
    expect(secretsLeaked(row)).toBe(false)
    expect(JSON.stringify(row?.public_config)).not.toContain(MERCHANT_KEY)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('enabling is refused until the connection test passed for these exact credentials', async () => {
    await ownerSavesCredentials()
    const refused = await savePaytrSettings(PROJECT_A, {
      merchantId: MERCHANT_ID,
      merchantKey: '',
      merchantSalt: '',
      testMode: true,
      enabled: true,
    })
    expect(refused).toEqual({ ok: false, error: 'test_required' })
    expect(credentialFingerprint({ merchantId: MERCHANT_ID, merchantKey: MERCHANT_KEY, merchantSalt: MERCHANT_SALT, testMode: true })).toBeTruthy()
  })

  it('the rendered panel HTML contains no secret, with blank key/salt inputs', async () => {
    await ownerSavesCredentials()
    await testPaytrConnection(PROJECT_A)
    const view = await getPaytrSettings(PROJECT_A)
    const html = renderToStaticMarkup(createElement(PaytrPanel, { projectId: PROJECT_A, initial: view }))

    expect(html).toContain(MERCHANT_ID)
    expect(secretsLeaked(html)).toBe(false)
    expect(html).not.toMatch(/secret_encrypted|tested_fp/)
  })
})
