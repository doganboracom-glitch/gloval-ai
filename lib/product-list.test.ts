import { describe, expect, it } from 'vitest'
import { countByStatus, matchesStatus, STATUS_FILTERS } from './product-list'
import { formFromProduct, toProductInput } from './product-form'
import { checkProductInput } from './product-input'
import type { ProductRow } from './ecommerce'

const products = [
  { status: 'active' },
  { status: 'active' },
  { status: 'draft' },
  { status: 'archived' },
]

describe('status filter', () => {
  it('"all" matches every status', () => {
    expect(products.every((p) => matchesStatus(p, 'all'))).toBe(true)
  })

  it('a specific filter matches only that status', () => {
    expect(products.filter((p) => matchesStatus(p, 'archived'))).toEqual([{ status: 'archived' }])
    expect(products.filter((p) => matchesStatus(p, 'active'))).toHaveLength(2)
    expect(products.filter((p) => matchesStatus(p, 'draft'))).toHaveLength(1)
  })

  it('counts per tab add up to the total', () => {
    const counts = countByStatus(products)
    expect(counts).toEqual({ all: 4, active: 2, draft: 1, archived: 1 })
    expect(counts.active + counts.draft + counts.archived).toBe(counts.all)
  })

  it('offers all, active, draft and archived tabs', () => {
    expect(STATUS_FILTERS.map((f) => f.value)).toEqual(['all', 'active', 'draft', 'archived'])
  })
})

describe('publishing an archived product', () => {
  const archived = {
    id: 'p1',
    project_id: 'proj',
    owner_id: 'u1',
    category_id: null,
    name: 'Gümüş kolye',
    slug: 'gumus-kolye',
    description: 'El yapımı',
    price_cents: 129900,
    currency: 'TRY',
    sku: 'KLY-1',
    stock: 4,
    track_stock: true,
    status: 'archived',
    images: [{ url: 'https://example.com/a.jpg', alt: 'Kolye' }],
    compare_at_price_cents: null,
    vat_rate: 20,
    specs: [],
    shipping_note: null,
    seo_title: null,
    seo_description: null,
    show_on_home: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as ProductRow

  it('changes only the status and keeps every other field', () => {
    const before = toProductInput(formFromProduct(archived))
    const after = toProductInput({ ...formFromProduct(archived), status: 'active' })
    expect(after.status).toBe('active')
    expect({ ...after, status: before.status }).toEqual(before)
  })

  it('still passes the same validation rules', () => {
    const input = toProductInput({ ...formFromProduct(archived), status: 'active' })
    expect(checkProductInput(input).ok).toBe(true)
  })
})
