import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { LEGAL_DOCS } from '@/lib/legal/documents'
import { getCommonPlanCopy } from '@/lib/plan-copy'
import { PLANS } from '@/lib/pricing-config'
import { dictionary } from '@/lib/i18n'

const read = (rel: string) => readFileSync(path.resolve(__dirname, '..', rel), 'utf8')

describe('footer copy', () => {
  it('spells the cookie policy link correctly', () => {
    expect(dictionary.tr.footer.links.cookies).toBe('Çerez Politikası')
  })

  it('does not render a "secure payment" label above the payment logos', () => {
    const footer = read('components/site-footer.tsx')
    expect(footer).not.toContain('footer.securePayment')
    expect(footer).toContain('PLATFORM_PAYMENT_BADGES')
    const badges = read('components/payment-badges.tsx')
    expect(badges).toContain('/payment/iyzico-logo.svg')
    expect(badges).toContain('/payment/card-logos.svg')
  })
})

describe('PayTR wording on gloval.ai public surfaces', () => {
  const hasPaytr = (value: unknown) => /paytr/i.test(JSON.stringify(value))

  it('is absent from legal pages', () => {
    expect(hasPaytr(LEGAL_DOCS)).toBe(false)
  })

  it('is absent from pricing and plan copy', () => {
    expect(hasPaytr(PLANS)).toBe(false)
    expect(hasPaytr(getCommonPlanCopy('tr'))).toBe(false)
    expect(hasPaytr(getCommonPlanCopy('en'))).toBe(false)
    expect(read('lib/pricing-config.ts')).not.toMatch(/paytr/i)
  })

  it('lists only the live store payment methods and marks card payments as coming soon', () => {
 const source = read('lib/plan-copy.ts')
 expect(source).toContain("paymentMethods: 'Havale/EFT ve kapıda ödeme'")
 expect(source).toContain("paymentMethods: 'Bank transfer and cash on delivery'")
 expect(source).toContain("cardSoon: 'Kart ile ödeme (yakında)'")
 expect(source).toContain("cardSoon: 'Card payments (coming soon)'")
 expect(source).not.toMatch(/paymentProviders/)
  })
})
