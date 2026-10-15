import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebsiteSchema } from './website-schema'

type Row = Record<string, unknown>

/**
 * Minimal in-memory stand-in for the Supabase admin client. It enforces the
 * `(project_id, slug)` unique index and records every write; `update`/`delete`
 * are tracked so tests can prove the sync never issues them.
 */
const db = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    writes: [] as Array<{ table: string; op: string }>,
    seq: 0,
  }

  function builder(table: string) {
    const filters: Array<[string, unknown]> = []
    let mode: 'select' | 'insert' | 'write' = 'select'
    let head = false
    let inserted: Row[] = []
    let error: { code: string } | null = null

    const rowsOf = () => (state.tables[table] ??= [])
    const matching = () => rowsOf().filter((r) => filters.every(([k, v]) => r[k] === v))

    const api = {
      select(_cols?: string, opts?: { head?: boolean }) {
        head = !!opts?.head
        return api
      },
      eq(col: string, val: unknown) {
        filters.push([col, val])
        return api
      },
      insert(payload: Row | Row[]) {
        mode = 'insert'
        state.writes.push({ table, op: 'insert' })
        for (const item of Array.isArray(payload) ? payload : [payload]) {
          const clash = rowsOf().some(
            (r) => r.project_id === item.project_id && r.slug === item.slug,
          )
          if (clash) {
            error = { code: '23505' }
            return api
          }
          const row = { id: `${table}-${++state.seq}`, ...item }
          rowsOf().push(row)
          inserted.push(row)
        }
        return api
      },
      update() {
        mode = 'write'
        state.writes.push({ table, op: 'update' })
        return api
      },
      delete() {
        mode = 'write'
        state.writes.push({ table, op: 'delete' })
        return api
      },
      then(resolve: (v: unknown) => unknown) {
        if (mode === 'insert') return resolve({ data: inserted, error })
        if (mode === 'write') return resolve({ data: null, error: null })
        const rows = matching()
        return resolve({ data: head ? null : rows, count: rows.length, error: null })
      },
    }
    return api
  }

  return { state, client: { from: builder } }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))

import { syncStoreFromSchema } from './store-sync'

const PROJECT = 'proj-1'
const OWNER = 'owner-1'
const OTHER_PROJECT = 'proj-2'

type SchemaItem = {
  name: string
  price: string
  description?: string
  src?: string
  category?: string
  oldPrice?: string
  badge?: string
  sample?: boolean
}

function schemaOf(items: SchemaItem[], categories: string[] = []): WebsiteSchema {
  const sections: unknown[] = [{ type: 'hero' }]
  if (categories.length) sections.push({ type: 'categories', items: categories.map((name) => ({ name })) })
  sections.push({ type: 'products', title: 'Ürünler', items })
  return {
    meta: { name: 'luna', language: 'tr' },
    navigation: { logoText: 'luna', links: [] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections,
  } as unknown as WebsiteSchema
}

/** A product the owner fully customised in the "Ürünleri yönet" panel. */
function panelEditedProduct(overrides: Row = {}): Row {
  return {
    id: 'prod-edited',
    project_id: PROJECT,
    owner_id: OWNER,
    category_id: 'cat-panel',
    name: 'Gümüş Yüzük (Yeni)',
    slug: 'yuzuk',
    description: 'Panelde yazılan açıklama',
    price_cents: 129900,
    compare_at_price_cents: 159900,
    currency: 'TRY',
    images: [{ url: 'https://cdn.test/panel-1.jpg' }, { url: 'https://cdn.test/panel-2.jpg' }],
    stock: 7,
    track_stock: true,
    sku: 'YZK-001',
    vat_rate: 10,
    specs: [{ label: 'Ayar', value: '925' }],
    shipping_note: 'Aynı gün kargo',
    seo_title: 'Özel SEO başlığı',
    seo_description: 'Özel SEO açıklaması',
    status: 'active',
    show_on_home: true,
    sort_order: 3,
    ...overrides,
  }
}

const staleSchema = () =>
  schemaOf(
    [
      {
        name: 'Yüzük',
        price: '₺10',
        description: 'Eski şema açıklaması',
        src: 'https://cdn.test/schema.jpg',
        category: 'Eski Kategori',
      },
    ],
    ['Eski Kategori'],
  )

beforeEach(() => {
  db.state.tables = {}
  db.state.writes = []
  db.state.seq = 0
})

describe('syncStoreFromSchema keeps panel-managed products untouched', () => {
  it('never overwrites any owner-managed field, even when the schema disagrees', async () => {
    const before = panelEditedProduct()
    db.state.tables.ecommerce_products = [{ ...before }]
    // Collections membership lives in its own table and must survive too.
    db.state.tables.ecommerce_product_collections = [
      { project_id: PROJECT, collection_id: 'col-1', product_id: 'prod-edited' },
    ]
    const collectionsBefore = structuredClone(db.state.tables.ecommerce_product_collections)

    await syncStoreFromSchema(PROJECT, OWNER, staleSchema())

    expect(db.state.tables.ecommerce_products).toEqual([before])
    expect(db.state.tables.ecommerce_product_collections).toEqual(collectionsBefore)
    expect(db.state.writes.filter((w) => w.table === 'ecommerce_products')).toEqual([])
  })

  it.each([
    ['name', 'Panel Adı'],
    ['price_cents', 4200],
    ['compare_at_price_cents', 9900],
    ['description', null],
    ['images', []],
    ['category_id', null],
    ['stock', 0],
    ['track_stock', false],
    ['vat_rate', 0],
    ['specs', []],
    ['seo_title', null],
    ['seo_description', null],
    ['show_on_home', false],
    ['status', 'draft'],
    ['status', 'archived'],
  ])('keeps %s = %j as set in the panel', async (field, value) => {
    const before = panelEditedProduct({ [field]: value })
    db.state.tables.ecommerce_products = [{ ...before }]

    await syncStoreFromSchema(PROJECT, OWNER, staleSchema())

    expect(db.state.tables.ecommerce_products[0]).toEqual(before)
  })

  it('never issues an update or delete against products or collection links', async () => {
    db.state.tables.ecommerce_products = [panelEditedProduct()]
    await syncStoreFromSchema(PROJECT, OWNER, staleSchema())
    expect(db.state.writes.filter((w) => w.op === 'update' || w.op === 'delete')).toEqual([])
  })
})

describe('syncStoreFromSchema inserts what is missing', () => {
  it('adds a schema product that is not in the database with panel defaults', async () => {
    db.state.tables.ecommerce_products = [panelEditedProduct()]
    const schema = schemaOf([
      { name: 'Yüzük', price: '₺10' },
      { name: 'Kolye', price: '₺1.299,00', description: 'Altın kolye', src: 'https://cdn.test/k.jpg' },
    ])

    await syncStoreFromSchema(PROJECT, OWNER, schema)

    const rows = db.state.tables.ecommerce_products
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(panelEditedProduct())
    expect(rows[1]).toMatchObject({
      project_id: PROJECT,
      owner_id: OWNER,
      name: 'Kolye',
      slug: 'kolye',
      description: 'Altın kolye',
      price_cents: 129900,
      images: ['https://cdn.test/k.jpg'],
      stock: 0,
      track_stock: false,
      status: 'active',
    })
  })

  it('creates missing categories and links the new product to them', async () => {
    await syncStoreFromSchema(
      PROJECT,
      OWNER,
      schemaOf([{ name: 'Kolye', price: '₺100', category: 'Takı' }], ['Takı']),
    )
    const [cat] = db.state.tables.ecommerce_categories
    expect(cat).toMatchObject({ slug: 'taki', project_id: PROJECT })
    expect(db.state.tables.ecommerce_products[0].category_id).toBe(cat.id)
  })

  it('honours the owner product limit across all of their stores', async () => {
    db.state.tables.ecommerce_products = [
      panelEditedProduct({ id: 'a', slug: 'a' }),
      panelEditedProduct({ id: 'b', slug: 'b', project_id: OTHER_PROJECT }),
    ]
    await syncStoreFromSchema(
      PROJECT,
      OWNER,
      schemaOf([
        { name: 'Bir', price: '₺1' },
        { name: 'İki', price: '₺2' },
      ]),
      { productLimit: 3 },
    )
    expect(db.state.tables.ecommerce_products).toHaveLength(3)
  })
})

describe('syncStoreFromSchema idempotency', () => {
  it('publishing twice never duplicates products or categories', async () => {
    const schema = schemaOf(
      [
        { name: 'Kolye', price: '₺100', category: 'Takı' },
        { name: 'Küpe', price: '₺50', category: 'Takı' },
        { name: 'Kolye', price: '₺999', category: 'Takı' },
      ],
      ['Takı'],
    )

    await syncStoreFromSchema(PROJECT, OWNER, schema)
    const afterFirst = structuredClone(db.state.tables)
    await syncStoreFromSchema(PROJECT, OWNER, schema)

    expect(db.state.tables).toEqual(afterFirst)
    expect(db.state.tables.ecommerce_products.map((p) => p.slug)).toEqual(['kolye', 'kupe'])
    expect(db.state.tables.ecommerce_categories).toHaveLength(1)
  })
})

describe('syncStoreFromSchema does not revive removed products', () => {
  it.each(['archived', 'draft'])('does not re-insert or reactivate a %s product', async (status) => {
    const before = panelEditedProduct({ status })
    db.state.tables.ecommerce_products = [{ ...before }]

    await syncStoreFromSchema(PROJECT, OWNER, staleSchema())

    expect(db.state.tables.ecommerce_products).toEqual([before])
  })
})

describe('syncStoreFromSchema keeps sample products out of the live catalog', () => {
  it('inserts sample products as draft and real ones as active', async () => {
    const schema = schemaOf([
      { name: 'Örnek Ürün', price: '₺100', sample: true },
      { name: 'Gerçek Ürün', price: '₺200' },
    ])

    await syncStoreFromSchema(PROJECT, OWNER, schema)

    const rows = db.state.tables.ecommerce_products
    expect(rows.find((r) => r.slug === 'ornek-urun')).toMatchObject({ status: 'draft' })
    expect(rows.find((r) => r.slug === 'gercek-urun')).toMatchObject({ status: 'active' })
  })

  it('leaves a legacy schema item with a badge or old price active (no sample flag)', async () => {
    const schema = schemaOf([{ name: 'Rozetli', price: '₺100', oldPrice: '₺150', badge: 'Yeni' }])

    await syncStoreFromSchema(PROJECT, OWNER, schema)

    expect(db.state.tables.ecommerce_products[0]).toMatchObject({ slug: 'rozetli', status: 'active' })
  })

  it('never touches an already-live store product, even if the schema now flags it sample', async () => {
    const before = panelEditedProduct({ status: 'active' })
    db.state.tables.ecommerce_products = [{ ...before }]
    const schema = schemaOf([{ name: 'Yüzük', price: '₺10', sample: true }])

    await syncStoreFromSchema(PROJECT, OWNER, schema)

    expect(db.state.tables.ecommerce_products).toEqual([before])
    expect(db.state.writes.filter((w) => w.table === 'ecommerce_products')).toEqual([])
  })

  it('republishing an existing store only adds the new sample item as draft', async () => {
    const live = panelEditedProduct({ status: 'active' })
    db.state.tables.ecommerce_products = [{ ...live }]
    const schema = schemaOf([
      { name: 'Yüzük', price: '₺10' },
      { name: 'Yeni Örnek', price: '₺5', sample: true },
    ])

    await syncStoreFromSchema(PROJECT, OWNER, schema)

    const rows = db.state.tables.ecommerce_products
    expect(rows[0]).toEqual(live)
    expect(rows[1]).toMatchObject({ slug: 'yeni-ornek', status: 'draft' })
  })
})
