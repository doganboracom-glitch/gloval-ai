import { describe, expect, it } from 'vitest'
import { validateMakerRequestInput } from './validation'

const validInput = {
  fullName: '  Derya  Yılmaz  ',
  phone: '+90 (555) 123-45-67',
  email: 'Derya@example.com',
  budgetRange: '10000-25000',
  referenceLinks: [' https://example.com ', '', 'https://example.com/', 'https://studio.example'],
  consent: true,
  lang: 'tr',
}

describe('validateMakerRequestInput', () => {
  it('normalizes contact values and removes empty or duplicate references', () => {
    const result = validateMakerRequestInput(validInput)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({
      fullName: 'Derya Yılmaz',
      phone: '+90 (555) 123-45-67',
      email: 'derya@example.com',
      budgetRange: '10000-25000',
      referenceLinks: ['https://example.com/', 'https://studio.example/'],
      lang: 'tr',
    })
  })

  it('requires consent and validates email, phone, and budget', () => {
    expect(validateMakerRequestInput({ ...validInput, consent: false }).ok).toBe(false)
    expect(validateMakerRequestInput({ ...validInput, email: 'not-an-email' }).ok).toBe(false)
    expect(validateMakerRequestInput({ ...validInput, phone: 'abc' }).ok).toBe(false)
    expect(validateMakerRequestInput({ ...validInput, budgetRange: 'custom' }).ok).toBe(false)
  })

  it('rejects more than five unique HTTP(S) links and unsafe protocols', () => {
    const sixLinks = Array.from({ length: 6 }, (_, index) => `https://site-${index}.example`)
    expect(validateMakerRequestInput({ ...validInput, referenceLinks: sixLinks })).toEqual({
      ok: false,
      reason: 'too_many_links',
    })
    expect(validateMakerRequestInput({ ...validInput, referenceLinks: ['javascript:alert(1)'] }).ok).toBe(false)
  })

  it('rejects overlong names and link values', () => {
    expect(validateMakerRequestInput({ ...validInput, fullName: 'x'.repeat(121) }).ok).toBe(false)
    expect(validateMakerRequestInput({ ...validInput, referenceLinks: [`https://${'a'.repeat(300)}.com`] }).ok).toBe(false)
  })
})
