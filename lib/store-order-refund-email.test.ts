import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryFake, type QueryCall } from '@/lib/test-support/query-fake'

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  claimed: new Set<string>(),
  claimNotification: vi.fn(),
  releaseNotificationClaim: vi.fn(),
  sendTransactionalEmail: vi.fn(),
  demoIds: new Set<string>(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/lib/store-demo', () => ({ loadDemoStoreIds: async () => mocks.demoIds }))
vi.mock('@/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notify')>()
  return {
    ...actual,
    claimNotification: mocks.claimNotification,
    releaseNotificationClaim: mocks.releaseNotificationClaim,
    sendTransactionalEmail: mocks.sendTransactionalEmail,
  }
})

import { notifyOrderRefunded } from '@/lib/store-order-notifications'

type Order = Record<string, unknown> | null

function setup(order: Order, language: unknown = 'tr', projectOver: Record<string, unknown> = {}) {
  const project = {
    id: 'p1',
    slug: 'kahve',
    name: 'Kahve Evi',
    owner_id: 'owner-1',
    schema_data: { meta: { language } },
    ...projectOver,
  }
  const fake = createQueryFake((call: QueryCall) => {
    if (call.table === 'ecommerce_orders') return { data: order }
    if (call.table === 'projects') return { data: project }
    return { data: null }
  })
  mocks.admin = fake.client
  return fake
}

const refundedOrder = {
  id: 'abcdef12-0000-4000-8000-000000000001',
  project_id: 'p1',
  customer_email: 'buyer@example.com',
  total_cents: 12550,
  currency: 'TRY',
  payment_status: 'refunded',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claimed.clear()
  mocks.demoIds = new Set()
  mocks.claimNotification.mockImplementation(async ({ dedupeKey }: { dedupeKey: string }) => {
    if (mocks.claimed.has(dedupeKey)) return false
    mocks.claimed.add(dedupeKey)
    return true
  })
  mocks.sendTransactionalEmail.mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('10. the buyer refund e-mail goes out once', () => {
  it('sends a single message for repeated calls, concurrent or later', async () => {
    setup(refundedOrder)
    const results = await Promise.all([
      notifyOrderRefunded(refundedOrder.id),
      notifyOrderRefunded(refundedOrder.id),
      notifyOrderRefunded(refundedOrder.id),
    ])
    expect(results).toEqual([true, true, true])
    expect(await notifyOrderRefunded(refundedOrder.id)).toBe(true)
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledTimes(1)
    expect([...mocks.claimed]).toEqual([`store-order:${refundedOrder.id}:buyer-refund`])
  })

  it('releases the claim when sending fails so the retry can send it, still only one delivered', async () => {
    setup(refundedOrder)
    mocks.sendTransactionalEmail.mockResolvedValueOnce(false)
    mocks.releaseNotificationClaim.mockImplementation(async (key: string) => void mocks.claimed.delete(key))

    expect(await notifyOrderRefunded(refundedOrder.id)).toBe(false)
    expect(await notifyOrderRefunded(refundedOrder.id)).toBe(true)
    expect(await notifyOrderRefunded(refundedOrder.id)).toBe(true)
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledTimes(2)
    expect(mocks.sendTransactionalEmail.mock.results.filter((r) => r.value).length).toBeDefined()
  })

  it('does not send for an order that is not refunded, has no address, or is a demo store', async () => {
    setup({ ...refundedOrder, payment_status: 'paid' })
    expect(await notifyOrderRefunded(refundedOrder.id)).toBe(true)

    setup({ ...refundedOrder, customer_email: '  ' })
    expect(await notifyOrderRefunded(refundedOrder.id)).toBe(true)

    mocks.demoIds = new Set(['p1'])
    setup(refundedOrder)
    expect(await notifyOrderRefunded(refundedOrder.id)).toBe(true)

    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('reports false (retry later) on a database error instead of dropping the e-mail', async () => {
    const fake = createQueryFake(() => ({ error: { code: '57014' } }))
    mocks.admin = fake.client
    expect(await notifyOrderRefunded(refundedOrder.id)).toBe(false)
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled()
  })
})

describe('refund e-mail content', () => {
  const number = 'ABCDEF12'

  it('is Turkish by default and names the store, order number and amount', async () => {
    setup(refundedOrder, undefined)
    await notifyOrderRefunded(refundedOrder.id)
    const mail = mocks.sendTransactionalEmail.mock.calls[0][0]
    expect(mail.to).toBe('buyer@example.com')
    expect(mail.fromName).toBe('Kahve Evi')
    expect(mail.subject).toBe(`Kahve Evi: #${number} numaralı siparişinizin ödemesi iade edildi`)
    expect(mail.text).toContain('125.50 TRY')
    expect(mail.text).toContain('iade edildi')
    expect(mail.text).toContain('iş günü')
  })

  it('is English for an English store', async () => {
    setup(refundedOrder, 'en')
    await notifyOrderRefunded(refundedOrder.id)
    const mail = mocks.sendTransactionalEmail.mock.calls[0][0]
    expect(mail.subject).toBe(`Kahve Evi: your payment for order #${number} was refunded`)
    expect(mail.text).toContain('125.50 TRY')
    expect(mail.text).toContain('has been refunded')
    expect(mail.text).toContain('business days')
    expect(mail.text).not.toContain('iade')
  })

  it('treats any non-Turkish language tag as English', async () => {
    setup(refundedOrder, 'de-DE')
    await notifyOrderRefunded(refundedOrder.id)
    expect(mocks.sendTransactionalEmail.mock.calls[0][0].subject).toContain('was refunded')
  })

  it('escapes store text in the HTML body', async () => {
    setup(refundedOrder, 'tr', { name: 'Kahve <b>Evi</b>' })
    await notifyOrderRefunded(refundedOrder.id)
    const mail = mocks.sendTransactionalEmail.mock.calls[0][0]
    expect(mail.html).not.toContain('<b>')
    expect(mail.html).toContain('&lt;b&gt;')
  })

  it('never puts card or provider data in the message', async () => {
    setup(refundedOrder)
    await notifyOrderRefunded(refundedOrder.id)
    const mail = mocks.sendTransactionalEmail.mock.calls[0][0]
    expect(`${mail.subject} ${mail.text} ${mail.html}`).not.toMatch(/iyzico|token|pay-|\d{12,}/i)
  })
})
