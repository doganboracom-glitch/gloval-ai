import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/store-customer', () => ({ getCurrentCustomerIdForProject: vi.fn(async () => null) }))

const SECRET = 'test-secret-for-order-links'
const PROJECT_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const OTHER_PROJECT_ID = 'aaaaaaaa-0000-4000-8000-000000000002'
const ORDER_ID = 'bbbbbbbb-0000-4000-8000-000000000001'
const OTHER_ORDER_ID = 'bbbbbbbb-0000-4000-8000-000000000002'

/** Columns that really exist on `ecommerce_orders` in the live schema. Selecting anything else makes PostgREST error. */
const REAL_ORDER_COLUMNS = new Set([
  'id', 'project_id', 'customer_id', 'status', 'payment_status', 'customer_name', 'customer_email',
  'subtotal_cents', 'shipping_cents', 'total_cents', 'currency', 'created_at', 'payment_provider',
  'shipping_status', 'tracking_carrier', 'tracking_number', 'shipped_at', 'delivered_at',
  'payment_ref', 'payment_nonce',
])

const order = {
  id: ORDER_ID,
  project_id: PROJECT_ID,
  customer_id: null,
  status: 'processing',
  payment_status: 'paid',
  customer_name: 'Ayşe Yılmaz',
  customer_email: 'ayse@example.com',
  subtotal_cents: 10000,
  shipping_cents: 0,
  total_cents: 10000,
  currency: 'TRY',
  created_at: '2026-10-01T10:00:00.000Z',
  payment_provider: 'iyzico',
  shipping_status: 'shipped',
  tracking_carrier: 'ups',
  tracking_number: 'AB-123456',
}
const otherStoreOrder = { ...order, id: OTHER_ORDER_ID, project_id: OTHER_PROJECT_ID }

const projects = [
  { id: PROJECT_ID, slug: 'luna-mucevher', published: true, schema_data: {} },
  { id: OTHER_PROJECT_ID, slug: 'baska-magaza', published: true, schema_data: {} },
]

function makeAdmin() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let columns = ''
      const b = {
        select(cols: string) {
          columns = cols
          return b
        },
        eq(col: string, value: unknown) {
          filters[col] = value
          return b
        },
        async maybeSingle() {
          if (table === 'projects') {
            return { data: projects.find((p) => p.slug === filters.slug && p.published === filters.published) ?? null, error: null }
          }
          if (table === 'ecommerce_orders') {
            const unknown = columns.split(',').map((c) => c.trim()).filter((c) => !REAL_ORDER_COLUMNS.has(c))
            if (unknown.length) {
              return { data: null, error: { code: '42703', message: `column ecommerce_orders.${unknown[0]} does not exist` } }
            }
            const row = [order, otherStoreOrder].find((o) => o.id === filters.id && o.project_id === filters.project_id)
            return { data: row ?? null, error: null }
          }
          return { data: null, error: null }
        },
        then(resolve: (v: unknown) => void) {
          resolve({ data: [], error: null })
        },
      }
      return b
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

beforeEach(() => {
  process.env.STORE_ORDER_TOKEN_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

async function mod() {
  return import('./store-order-access')
}

function tokenFromUrl(url: string): string | null {
  return new URL(url, 'https://gloval.ai').searchParams.get('t')
}

describe('order link: real signer -> real verifier -> page read', () => {
  it('selects only columns that exist in the live schema', async () => {
    const { ORDER_CONFIRMATION_COLUMNS } = await mod()
    const cols = ORDER_CONFIRMATION_COLUMNS.split(',').map((c) => c.trim())
    expect(cols.filter((c) => !REAL_ORDER_COLUMNS.has(c))).toEqual([])
  })

  it('renders the order for the URL built by orderStatusUrl (iyzico return and every email)', async () => {
    const { orderStatusUrl, getOrderConfirmation } = await mod()
    const url = orderStatusUrl('luna-mucevher', ORDER_ID)
    expect(url).toMatch(/^https:\/\/[^/]+\/site\/luna-mucevher\/order\/[0-9a-f-]{36}\?t=\d+\./)
    const result = await getOrderConfirmation(ORDER_ID, 'luna-mucevher', tokenFromUrl(url))
    expect(result?.id).toBe(ORDER_ID)
    expect(result?.carrier).toBe('UPS')
    expect(result?.tracking_number).toBe('AB-123456')
  })

  it('renders the order for the path built by buildOrderPath (bank transfer / cash on delivery result)', async () => {
    const { buildOrderPath, issueOrderAccessToken, getOrderConfirmation } = await mod()
    const path = buildOrderPath('luna-mucevher', ORDER_ID, issueOrderAccessToken(ORDER_ID))
    expect(await getOrderConfirmation(ORDER_ID, 'luna-mucevher', tokenFromUrl(path))).not.toBeNull()
  })

  it('rejects a wrong signature', async () => {
    const { orderStatusUrl, getOrderConfirmation } = await mod()
    const token = tokenFromUrl(orderStatusUrl('luna-mucevher', ORDER_ID))!
    const [exp, sig] = token.split('.')
    const forged = `${exp}.${sig.slice(0, -2)}${sig.endsWith('AA') ? 'BB' : 'AA'}`
    expect(await getOrderConfirmation(ORDER_ID, 'luna-mucevher', forged)).toBeNull()
  })

  it('rejects a token issued for a different order id', async () => {
    const { issueOrderAccessToken, getOrderConfirmation } = await mod()
    expect(await getOrderConfirmation(ORDER_ID, 'luna-mucevher', issueOrderAccessToken(OTHER_ORDER_ID))).toBeNull()
  })

  it('rejects another store\'s order even with a valid token for that order', async () => {
    const { issueOrderAccessToken, getOrderConfirmation } = await mod()
    expect(await getOrderConfirmation(OTHER_ORDER_ID, 'luna-mucevher', issueOrderAccessToken(OTHER_ORDER_ID))).toBeNull()
  })

  it('rejects an expired token', async () => {
    const { signOrderToken } = await import('./store-order-token')
    const { getOrderConfirmation } = await mod()
    const expired = signOrderToken(ORDER_ID, SECRET, Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60)
    expect(await getOrderConfirmation(ORDER_ID, 'luna-mucevher', expired)).toBeNull()
  })

  it('rejects a missing token and a token signed with a different secret', async () => {
    const { signOrderToken } = await import('./store-order-token')
    const { getOrderConfirmation } = await mod()
    expect(await getOrderConfirmation(ORDER_ID, 'luna-mucevher', null)).toBeNull()
    expect(await getOrderConfirmation(ORDER_ID, 'luna-mucevher', signOrderToken(ORDER_ID, 'other-secret'))).toBeNull()
  })
})
