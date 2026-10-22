import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/__fixtures__/fake-db'
import { buildCleanSite } from '@/lib/__fixtures__/sample-site'
import { createCategory, createProduct } from '@/lib/ecommerce'
import { savePaymentSettings } from '@/lib/payment-settings'
import { getPublishedSite, publishProject, saveProjectSchema } from '@/lib/projects'
import { getPublishedSiteCommerceMode } from '@/lib/commerce-mode-server'
import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createClient: async () => fakeDb.client() }
})
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createAdminClient: () => fakeDb.client() }
})
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: async () => ({ code: 'pro' }),
  getPlanCodeForUser: async () => 'pro',
}))
vi.mock('@/lib/billing-lifecycle', () => ({ isSubscriptionSuspended: async () => false }))
vi.mock('@/lib/effective-limits', () => ({
  getEffectiveSiteLimit: async () => 5,
  getEffectiveProductLimit: async () => null,
}))
vi.mock('@/lib/store-sync', () => ({ syncStoreFromSchema: vi.fn(async () => {}) }))
vi.mock('@/lib/store-revalidate', () => ({ revalidateStorefront: vi.fn(async () => {}) }))

/**
 * Regression guard for the DBAJANS incident: a corporate site that merely held
 * a products/collections section used to be promoted to `ecommerce` on save.
 * `project_type` / `commerce_mode` may only change through project creation and
 * the admin `setSiteType` action, never through any of the flows below.
 */
const ID = 'project-1'
const SLUG = 'kurumsal-site'

const kind = () => {
  const row = fakeDb.rows('projects')[0]
  return { project_type: row.project_type, commerce_mode: row.commerce_mode }
}
const CORPORATE = { project_type: 'corporate', commerce_mode: 'none' }
const PRODUCT = { name: 'Ürün', priceCents: 10000, stock: 5 }

function storeSchema(): WebsiteSchema {
  const site = buildCleanSite()
  expect(isStorefront(site)).toBe(true)
  return site
}

beforeEach(() => {
  fakeDb.reset()
  fakeDb.rows('projects').push({
    id: ID,
    owner_id: 'user-1',
    name: 'Kurumsal',
    slug: null,
    published: false,
    published_version_id: null,
    schema_data: buildCleanSite(),
    ...CORPORATE,
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('a corporate site keeps its type through every store-adjacent flow', () => {
  it('saving a schema with a products/categories section', async () => {
    await saveProjectSchema({ id: ID, schema: storeSchema() })
    expect(kind()).toEqual(CORPORATE)
  })

  it('publishing it', async () => {
    const result = await publishProject({ id: ID, schema: storeSchema() })
    expect(result.ok).toBe(true)
    expect(fakeDb.rows('projects')[0].published).toBe(true)
    expect(kind()).toEqual(CORPORATE)
  })

  it('visiting the published product page data (site + commerce mode)', async () => {
    await publishProject({ id: ID, schema: storeSchema() })
    fakeDb.writes.length = 0
    fakeDb.rpcRow = { ...fakeDb.rows('projects')[0], schema_data: storeSchema() }

    await getPublishedSite(SLUG)
    await getPublishedSiteCommerceMode(SLUG)

    expect(fakeDb.writes.filter((w) => w.table === 'projects')).toEqual([])
    expect(kind()).toEqual(CORPORATE)
  })

  it('adding a product and a category', async () => {
    await createCategory(ID, 'Koleksiyon')
    await createProduct(ID, PRODUCT)
    expect(kind()).toEqual(CORPORATE)
  })

  it('turning a payment method on', async () => {
    const result = await savePaymentSettings(ID, {
      enabled: ['bank_transfer'],
      publicConfig: {
        bank_transfer: { bank_name: 'Ziraat Bankası', iban: 'TR330006100519786457841326', account_holder: 'Kurumsal AŞ' },
      },
      secrets: {},
    })
    expect(result).toEqual({ ok: true })
    expect(kind()).toEqual(CORPORATE)
  })

  it('all of them in sequence leave the row untouched', async () => {
    await saveProjectSchema({ id: ID, schema: storeSchema() })
    await publishProject({ id: ID, schema: storeSchema() })
    await createProduct(ID, PRODUCT)
    await savePaymentSettings(ID, { enabled: [], publicConfig: {}, secrets: {} })
    expect(kind()).toEqual(CORPORATE)
  })
})
