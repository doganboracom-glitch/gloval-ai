import { describe, expect, it } from 'vitest'
import { parseEmailLang, resolveEmailLang } from './lang'

describe('resolveEmailLang', () => {
  it('keeps Turkish for a stored tr preference', () => {
    expect(resolveEmailLang('tr')).toBe('tr')
    expect(resolveEmailLang('tr-TR')).toBe('tr')
  })

  it('keeps English for a stored en preference', () => {
    expect(resolveEmailLang('en')).toBe('en')
  })

  it('defaults to Turkish when nothing is known', () => {
    expect(resolveEmailLang()).toBe('tr')
    expect(resolveEmailLang(undefined, null, '', 42, '???')).toBe('tr')
  })

  it('falls back to English for languages other than Turkish and English', () => {
    expect(resolveEmailLang('fr')).toBe('en')
    expect(resolveEmailLang('de-AT')).toBe('en')
    expect(resolveEmailLang('ar')).toBe('en')
  })

  it('uses the first candidate that carries a language', () => {
    expect(resolveEmailLang(undefined, 'tr', 'en')).toBe('tr')
    expect(resolveEmailLang(null, 'en', 'tr')).toBe('en')
    expect(resolveEmailLang('', 'fr', 'tr')).toBe('en')
  })

  it('reports unusable values as null in parseEmailLang', () => {
    expect(parseEmailLang(undefined)).toBeNull()
    expect(parseEmailLang('  ')).toBeNull()
    expect(parseEmailLang({})).toBeNull()
  })
})
