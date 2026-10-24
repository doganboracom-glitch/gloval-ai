import { describe, expect, it } from 'vitest'
import { suggestDomain, validateEmail } from './email-validation'

describe('validateEmail', () => {
  it('accepts ordinary addresses and normalises case/whitespace', () => {
    expect(validateEmail('  Ada@Example.COM ')).toEqual({ ok: true, email: 'ada@example.com' })
    expect(validateEmail('a.b+tag@mail.example.co.uk').ok).toBe(true)
  })

  it('rejects a dotless host and offers the provider fix', () => {
    expect(validateEmail('music.operatoru@hotmailcom')).toEqual({
      ok: false,
      reason: 'domain',
      suggestion: 'music.operatoru@hotmail.com',
    })
  })

  it('rejects structurally broken addresses', () => {
    for (const bad of ['', 'plain', '@x.com', 'a@', 'a@@x.com', 'a b@x.com', 'a..b@x.com', 'a@x', 'a@x.c', 'a@-x.com']) {
      expect(validateEmail(bad).ok).toBe(false)
    }
  })

  it('hints, without blocking, on a typo of a common provider', () => {
    expect(validateEmail('ada@gmial.com')).toEqual({
      ok: true,
      email: 'ada@gmial.com',
      suggestion: 'ada@gmail.com',
    })
  })

  it('stays quiet for real, different providers', () => {
    expect(validateEmail('ada@mail.com')).toEqual({ ok: true, email: 'ada@mail.com' })
    expect(validateEmail('ada@gmail.com')).toEqual({ ok: true, email: 'ada@gmail.com' })
  })
})

describe('suggestDomain', () => {
  it('maps common typos', () => {
    expect(suggestDomain('hotmial.com')).toBe('hotmail.com')
    expect(suggestDomain('outlookcom')).toBe('outlook.com')
    expect(suggestDomain('example.com')).toBeNull()
  })
})
