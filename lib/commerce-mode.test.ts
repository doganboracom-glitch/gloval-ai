import { describe, expect, it } from 'vitest'
import { DEMO_PHONE } from '@/lib/contact-links'
import { PRODUCT_LIMITS, type PlanCode } from '@/lib/pricing-config'
import {
  ASK_PRICE_LABEL,
  CATALOG_PRODUCT_LIMIT,
  NON_INDEXABLE_STORE_PATHS,
  buildWhatsappOrderUrl,
  getCommerceMode,
  isPlaceholderNumber,
  modeHasStoreRoutes,
  modeHasTransactions,
  modeUsesWhatsappOrder,
  panelAreasFor,
  planAllowsCatalog,
  storeSeoPlan,
  toPriceMode,
  toWhatsappDigits,
  usableWhatsappNumber,
} from '@/lib/commerce-mode'

const PLANS: PlanCode[] = ['free', 'starter', 'pro', 'ecommerce']

describe('plan gate', () => {
  it('allows the catalog only on PRO and E-Ticaret', () => {
    expect(PLANS.map((p) => [p, planAllowsCatalog(p)])).toEqual([
      ['free', false],
      ['starter', false],
      ['pro', true],
      ['ecommerce', true],
    ])
    expect(planAllowsCatalog(null)).toBe(false)
    expect(planAllowsCatalog(undefined)).toBe(false)
  })

  it('caps the catalog at the PRO product limit (50)', () => {
    expect(CATALOG_PRODUCT_LIMIT).toBe(50)
    expect(CATALOG_PRODUCT_LIMIT).toBe(PRODUCT_LIMITS.pro)
  })
})

describe('getCommerceMode', () => {
  it('maps legacy projects from project_type when commerce_mode is absent', () => {
    expect(getCommerceMode({ project_type: 'ecommerce' })).toBe('ecommerce')
    expect(getCommerceMode({ project_type: 'corporate' })).toBe('none')
    expect(getCommerceMode({ project_type: null })).toBe('none')
    expect(getCommerceMode({ commerce_mode: null, project_type: 'ecommerce' })).toBe('ecommerce')
    expect(getCommerceMode({ commerce_mode: 'garbage', project_type: 'ecommerce' })).toBe('ecommerce')
  })

  it('prefers the stored mode', () => {
    expect(getCommerceMode({ commerce_mode: 'catalog', project_type: 'corporate' })).toBe('catalog')
    expect(getCommerceMode({ commerce_mode: 'none', project_type: 'ecommerce' })).toBe('none')
  })

  it('does not change legacy ecommerce/none behavior whatever the plan', () => {
    for (const plan of [...PLANS, null]) {
      expect(getCommerceMode({ commerce_mode: 'ecommerce', project_type: 'ecommerce' }, plan)).toBe('ecommerce')
      expect(getCommerceMode({ commerce_mode: 'none', project_type: 'corporate' }, plan)).toBe('none')
    }
  })

  it('degrades a catalog site to none when the owner is not on PRO or above', () => {
    const catalog = { commerce_mode: 'catalog', project_type: 'corporate' }
    expect(getCommerceMode(catalog, 'pro')).toBe('catalog')
    expect(getCommerceMode(catalog, 'ecommerce')).toBe('catalog')
    expect(getCommerceMode(catalog, 'starter')).toBe('none')
    expect(getCommerceMode(catalog, 'free')).toBe('none')
    expect(getCommerceMode(catalog, null)).toBe('none')
    expect(getCommerceMode(catalog)).toBe('catalog')
  })

  it('returns the catalog when the owner goes back to PRO', () => {
    const catalog = { commerce_mode: 'catalog', project_type: 'corporate' }
    expect(getCommerceMode(catalog, 'free')).toBe('none')
    expect(getCommerceMode(catalog, 'pro')).toBe('catalog')
  })
})

describe('what each mode exposes', () => {
  it('store routes: catalog and ecommerce only', () => {
    expect(modeHasStoreRoutes('ecommerce')).toBe(true)
    expect(modeHasStoreRoutes('catalog')).toBe(true)
    expect(modeHasStoreRoutes('none')).toBe(false)
  })

  it('transactions (cart/checkout/customers/orders): ecommerce only', () => {
    expect(modeHasTransactions('ecommerce')).toBe(true)
    expect(modeHasTransactions('catalog')).toBe(false)
    expect(modeHasTransactions('none')).toBe(false)
  })

  it('WhatsApp ordering: catalog only', () => {
    expect(modeUsesWhatsappOrder('catalog')).toBe(true)
    expect(modeUsesWhatsappOrder('ecommerce')).toBe(false)
    expect(modeUsesWhatsappOrder('none')).toBe(false)
  })

  it('seller panel areas per mode', () => {
    expect(panelAreasFor('ecommerce')).toEqual([
      'products',
      'collections',
      'orders',
      'customers',
      'payments',
      'shipping',
    ])
    expect(panelAreasFor('catalog')).toEqual(['products', 'collections'])
    expect(panelAreasFor('none')).toEqual([])
  })
})

describe('SEO plan', () => {
  it('indexes the store for catalog and ecommerce, never for none', () => {
    expect(storeSeoPlan('catalog').indexStore).toBe(true)
    expect(storeSeoPlan('ecommerce').indexStore).toBe(true)
    expect(storeSeoPlan('none').indexStore).toBe(false)
  })

  it('always keeps transactional routes out of robots', () => {
    expect([...NON_INDEXABLE_STORE_PATHS]).toEqual(['/checkout', '/hesap', '/order/'])
    for (const mode of ['catalog', 'ecommerce', 'none'] as const) {
      expect(storeSeoPlan(mode).disallow).toEqual(['/checkout', '/hesap', '/order/'])
    }
  })
})

describe('price mode', () => {
  it('only "ask" asks; anything else shows the price', () => {
    expect(toPriceMode('ask')).toBe('ask')
    expect(toPriceMode('show')).toBe('show')
    expect(toPriceMode(undefined)).toBe('show')
    expect(toPriceMode(null)).toBe('show')
    expect(toPriceMode('weird')).toBe('show')
  })
})

describe('WhatsApp numbers', () => {
  it('normalizes Turkish local numbers to 90…', () => {
    expect(toWhatsappDigits('0532 123 45 67')).toBe('905321234567')
    expect(toWhatsappDigits('532 123 45 67')).toBe('905321234567')
    expect(toWhatsappDigits('+90 532 123 45 67')).toBe('905321234567')
    expect(toWhatsappDigits('00905321234567')).toBe('905321234567')
  })

  it('rejects empty or too-short input', () => {
    expect(toWhatsappDigits('')).toBeNull()
    expect(toWhatsappDigits(null)).toBeNull()
    expect(toWhatsappDigits(undefined)).toBeNull()
    expect(toWhatsappDigits('12345')).toBeNull()
  })

  it('treats the DEMO_PHONE in every format as a placeholder', () => {
    expect(isPlaceholderNumber(DEMO_PHONE.display)).toBe(true)
    expect(isPlaceholderNumber(DEMO_PHONE.tel)).toBe(true)
    expect(isPlaceholderNumber(DEMO_PHONE.whatsapp)).toBe(true)
    expect(isPlaceholderNumber('0850 000 00 00')).toBe(true)
  })

  it('blocks sample numbers: repeated and sequential digits', () => {
    expect(isPlaceholderNumber('0555 555 55 55')).toBe(true)
    expect(isPlaceholderNumber('+90 532 000 00 00')).toBe(true)
    expect(isPlaceholderNumber('0532 123 45 67')).toBe(true)
    expect(isPlaceholderNumber('0532 111 11 11')).toBe(true)
  })

  it('does not flag a real number', () => {
    expect(isPlaceholderNumber('0532 874 29 61')).toBe(false)
    expect(isPlaceholderNumber('')).toBe(false)
    expect(isPlaceholderNumber(null)).toBe(false)
  })

  it('usableWhatsappNumber hides the button without a real number', () => {
    expect(usableWhatsappNumber(DEMO_PHONE.display)).toBeNull()
    expect(usableWhatsappNumber('0555 555 55 55')).toBeNull()
    expect(usableWhatsappNumber('')).toBeNull()
    expect(usableWhatsappNumber(undefined)).toBeNull()
    expect(usableWhatsappNumber('0532 874 29 61')).toBe('905328742961')
  })
})

describe('buildWhatsappOrderUrl', () => {
  const base = {
    number: '905328742961',
    productName: 'Seramik Vazo',
    productUrl: 'https://demo.gloval.site/store/seramik-vazo',
    priceMode: 'show' as const,
    priceCents: 125000,
    currency: 'TRY',
  }

  function messageOf(url: string): string {
    const u = new URL(url)
    return u.searchParams.get('text') ?? ''
  }

  it('targets wa.me with the number and a ready message', () => {
    const url = buildWhatsappOrderUrl(base)
    expect(url.startsWith('https://wa.me/905328742961?text=')).toBe(true)
    const text = messageOf(url)
    expect(text).toContain('Seramik Vazo')
    expect(text).toContain('https://demo.gloval.site/store/seramik-vazo')
    expect(text).toMatch(/Fiyat: .*1\.250,00/)
  })

  it('uses the ask label instead of a price when price_mode=ask', () => {
    const text = messageOf(buildWhatsappOrderUrl({ ...base, priceMode: 'ask' }))
    expect(text).toContain(`Fiyat: ${ASK_PRICE_LABEL}`)
    expect(text).not.toMatch(/1\.250/)
  })

  it('url-encodes the message safely', () => {
    const url = buildWhatsappOrderUrl({ ...base, productName: 'A & B "özel" #1' })
    expect(url).not.toMatch(/[ "#](?=.*$)/)
    expect(messageOf(url)).toContain('A & B "özel" #1')
  })
})
