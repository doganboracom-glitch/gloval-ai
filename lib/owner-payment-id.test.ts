import { readdirSync, readFileSync, statSync } from 'node:fs'
import * as path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OwnerPaymentId } from '@/components/ecommerce/owner-payment-id'
import { OWNER_PAYMENT_ID_COPY, ownerPaymentId } from '@/lib/owner-payment-id'

describe('ownerPaymentId', () => {
  it('returns the paymentId for card (iyzico) orders', () => {
    expect(ownerPaymentId({ payment_provider: 'iyzico', provider_payment_id: ' 12345678 ' })).toBe('12345678')
  })

  it.each(['bank_transfer', 'cash_on_delivery'])('hides it for %s even if an id is stored', (provider) => {
    expect(ownerPaymentId({ payment_provider: provider, provider_payment_id: '12345678' })).toBeNull()
  })

  it.each([null, undefined, '', '   '])('hides it when the card order has no id (%s)', (id) => {
    expect(ownerPaymentId({ payment_provider: 'iyzico', provider_payment_id: id })).toBeNull()
  })
})

describe('OwnerPaymentId rendering', () => {
  it('shows the Turkish label, the id and a Kopyala button', () => {
    const html = renderToStaticMarkup(createElement(OwnerPaymentId, { paymentId: '98765', lang: 'tr' }))
    expect(html).toContain('iyzico Ödeme No')
    expect(html).toContain('98765')
    expect(html).toContain('Kopyala')
    expect(OWNER_PAYMENT_ID_COPY.tr.label).toBe('iyzico Ödeme No')
  })
})

describe('paymentId stays owner-only', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
    })
  }

  it('is not referenced by buyer pages, buyer components or buyer e-mails', () => {
    const root = path.resolve(__dirname, '..')
    const buyerFiles = [
      ...sourceFiles(path.join(root, 'app/site')),
      ...sourceFiles(path.join(root, 'components/store')),
      ...['store-order-email.ts', 'store-customer.ts', 'customer-order-detail.ts', 'store-order-access.ts'].map((f) =>
        path.join(root, 'lib', f),
      ),
    ]
    const leaking = buyerFiles.filter((f) => /provider_payment_id|paymentId/.test(readFileSync(f, 'utf8')))
    expect(leaking.map((f) => path.relative(root, f))).toEqual([])
  })
})
