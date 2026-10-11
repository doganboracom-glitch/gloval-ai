import { describe, expect, it } from 'vitest'
import {
  EMPTY_PRODUCT_FORM,
  applyProductFields,
  errorCountBySection,
  fieldDomId,
  sectionOfField,
  sectionSummary,
  sortFieldsByForm,
  toProductInput,
  validateProductForm,
  type ProductFormState,
} from '@/lib/product-form'
import { matchesSearch, stockLabel } from '@/lib/product-list'

const filled: ProductFormState = { ...EMPTY_PRODUCT_FORM, name: 'Altın kolye', price: '149,90' }

describe('validateProductForm', () => {
  it('accepts a minimal product and parses a comma price', () => {
    const { input, errors } = validateProductForm(filled)
    expect(errors).toEqual({})
    expect(input.priceCents).toBe(14990)
  })

  it('reports an empty name and missing price per field', () => {
    const { errors } = validateProductForm(EMPTY_PRODUCT_FORM)
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['name', 'price']))
  })

  it('keeps stock 0 when stock tracking is off', () => {
    expect(toProductInput({ ...filled, stock: '12', trackStock: false }).stock).toBe(0)
    expect(toProductInput({ ...filled, stock: '12', trackStock: true }).stock).toBe(12)
  })

  it('accepts a spec with an empty value', () => {
    const { errors } = validateProductForm({ ...filled, specs: [{ name: 'Su geçirmez', value: '' }] })
    expect(errors).toEqual({})
  })
})

describe('applyProductFields', () => {
  it('fills text fields and ignores a category outside the store', () => {
    const next = applyProductFields(filled, { description: 'Yeni', categoryId: 'x' }, { categoryIds: ['a'] })
    expect(next.description).toBe('Yeni')
    expect(next.categoryId).toBe('')
  })

  it('sets alts by index without touching other images', () => {
    const form = {
      ...filled,
      images: [
        { url: 'u1', alt: 'old' },
        { url: 'u2', alt: 'keep' },
      ],
    }
    const next = applyProductFields(form, { imageAlts: ['new', undefined] })
    expect(next.images.map((i) => i.alt)).toEqual(['new', 'keep'])
  })
})

describe('field helpers', () => {
  it('maps fields to sections and sorts them as on the form', () => {
    expect(sectionOfField('specs.2.name')).toBe('specs')
    expect(sectionOfField('compareAtPrice')).toBe('pricing')
    expect(sortFieldsByForm(['price', 'specs.1.name', 'name', 'specs.0.value'])).toEqual([
      'name',
      'price',
      'specs.0.value',
      'specs.1.name',
    ])
    expect(fieldDomId('specs.1.name')).toBe('pf-specs-1-name')
  })

  it('counts errors per section', () => {
    expect(errorCountBySection({ name: 'x', price: 'y', compareAtPrice: 'z' })).toMatchObject({ basics: 1, pricing: 2 })
  })

  it('summarises sections', () => {
    expect(sectionSummary('basics', EMPTY_PRODUCT_FORM).done).toBe(false)
    expect(sectionSummary('images', { ...filled, images: [{ url: 'u', alt: '' }] }).text).toBe('1 görsel')
  })
})

describe('product list helpers', () => {
  it('labels stock', () => {
    expect(stockLabel({ stock: 0, track_stock: false })).toBe('Sınırsız')
    expect(stockLabel({ stock: 0, track_stock: true })).toBe('Tükendi')
    expect(stockLabel({ stock: 5 })).toBe('5 adet')
  })

  it('searches name and sku in Turkish case rules', () => {
    expect(matchesSearch({ name: 'IŞIK Lambası', sku: null }, 'ışık')).toBe(true)
    expect(matchesSearch({ name: 'Kolye', sku: 'KL-01' }, 'kl-0')).toBe(true)
    expect(matchesSearch({ name: 'Kolye', sku: null }, 'yüzük')).toBe(false)
  })
})
