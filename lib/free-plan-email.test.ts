import { describe, expect, it } from 'vitest'
import { freePlanWelcomeEmail } from './free-plan-email'
import { AI_CREDIT_CONFIG } from './pricing-config'

describe('freePlanWelcomeEmail', () => {
  const { userSubject, userBody } = freePlanWelcomeEmail()

  it('greets warmly and states the gifted credits', () => {
    expect(userBody).toContain('Merhaba, FREE paketin başladı')
    expect(userBody).toContain(`${AI_CREDIT_CONFIG.free.credits} AI kredi hediye`)
  })

  it('never uses system wording', () => {
    expect(userBody).not.toMatch(/Kullanıcı|abone oldu|durum:/i)
    expect(userSubject).not.toMatch(/abonelik/i)
  })

  it('has no payment or VAT wording', () => {
    expect(`${userSubject} ${userBody}`).not.toMatch(/KDV|ödeme|fatura|tahsilat|₺|TL/i)
  })
})
