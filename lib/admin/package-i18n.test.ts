import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '@/lib/locale-registry'
import { PACKAGE_COPY, fmt, type PackageCopy } from './package-i18n'
import { adminT } from './i18n'

const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

function flatten(c: PackageCopy): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === 'string') out[k] = v
    else for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2 as string
  }
  return out
}

describe('package manager translations', () => {
  it('covers all 12 supported locales', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(12)
    for (const l of SUPPORTED_LOCALES) expect(PACKAGE_COPY[l]).toBeDefined()
  })

  it.each(SUPPORTED_LOCALES)('%s has every key, non-empty, with the same placeholders as tr', (l) => {
    const base = flatten(PACKAGE_COPY.tr)
    const cur = flatten(PACKAGE_COPY[l])
    expect(Object.keys(cur).sort()).toEqual(Object.keys(base).sort())
    for (const [k, v] of Object.entries(cur)) {
      expect(v.trim(), `${l}.${k}`).not.toBe('')
      expect(tokens(v), `${l}.${k}`).toBe(tokens(base[k]))
    }
  })

  it('warns about the unchanged provider subscription in every locale', () => {
    for (const l of SUPPORTED_LOCALES) expect(PACKAGE_COPY[l].liveWarning).toContain('{provider}')
  })

  it('adminT exposes pkg without losing existing tr/en sections', () => {
    expect(adminT('ar').pkg.planTitle).toBe(PACKAGE_COPY.ar.planTitle)
    expect(adminT('en').nav.users).toBe('Users')
    expect(adminT('tr').nav.users).toBe('Kullanıcılar')
  })

  it('fmt fills placeholders', () => {
    expect(fmt('a {x} b {y}', { x: 1, y: 'z' })).toBe('a 1 b z')
  })
})
