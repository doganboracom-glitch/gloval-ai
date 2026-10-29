import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bandOf, CRITERION_MAX, scoreDomainQuality, toAsciiLabel } from './quality-score'

const root = join(__dirname, '..', '..')

function ok(input: unknown) {
  const result = scoreDomainQuality(input)
  if (!result.ok) throw new Error(`expected ok for ${JSON.stringify(input)}, got ${result.reason}`)
  return result
}

describe('scoreDomainQuality', () => {
  it('is deterministic (same input, same output)', () => {
    expect(scoreDomainQuality('marka.com')).toEqual(scoreDomainQuality('marka.com'))
  })

  it('normalises case, spaces, protocol and www', () => {
    expect(ok('  HTTPS://WWW.Marka.COM/ ').domain).toBe('marka.com')
  })

  it('keeps every criterion inside 0..20 and the total inside 0..100', () => {
    for (const input of ['a1', 'marka', 'marka.com', 'x-y-z-1-2-3.net', 'zzzzzzzzzzzz.org', 'ağaç.com.tr', 'bcdfghjkl.info', 'aaaaa.co']) {
      const result = scoreDomainQuality(input)
      if (!result.ok) continue
      expect(result.total).toBeGreaterThanOrEqual(0)
      expect(result.total).toBeLessThanOrEqual(100)
      expect(result.total).toBe(result.criteria.reduce((sum, c) => sum + c.score, 0))
      for (const c of result.criteria) {
        expect(c.score).toBeGreaterThanOrEqual(0)
        expect(c.score).toBeLessThanOrEqual(CRITERION_MAX)
      }
    }
  })

  it('a short clean .com scores higher than a long hyphenated numbered .xyz', () => {
    expect(ok('marka.com').total).toBeGreaterThan(ok('bu-cok-uzun-bir-alan-adi-123456.xyz').total)
  })

  it('.com beats .net beats an unlisted extension for the same label', () => {
    expect(ok('marka.com').total).toBeGreaterThan(ok('marka.net').total)
    expect(ok('marka.net').total).toBeGreaterThan(ok('marka.xyz').total)
  })

  it('penalises hyphens and digits', () => {
    expect(ok('ma-rka.com').total).toBeLessThan(ok('marka.com').total)
    expect(ok('marka123.com').total).toBeLessThan(ok('marka.com').total)
  })

  it('maps Turkish letters to ASCII for the hint without changing the scored label', () => {
    expect(toAsciiLabel('çağrı-şöför')).toBe('cagri-sofor')
    expect(ok('çiçek.com').asciiLabel).toBe('cicek')
  })

  it('maps totals to bands at the documented edges', () => {
    expect(bandOf(80)).toBe('strong')
    expect(bandOf(79)).toBe('good')
    expect(bandOf(60)).toBe('good')
    expect(bandOf(59)).toBe('consider')
    expect(bandOf(40)).toBe('consider')
    expect(bandOf(39)).toBe('retry')
  })

  it('returns a typed failure instead of throwing on bad input', () => {
    expect(scoreDomainQuality('')).toEqual({ ok: false, reason: 'empty' })
    expect(scoreDomainQuality('a.com')).toMatchObject({ ok: false, reason: 'too_short' })
    expect(scoreDomainQuality('a'.repeat(101))).toMatchObject({ ok: false, reason: 'too_long' })
    expect(scoreDomainQuality('a'.repeat(64) + '.com')).toMatchObject({ ok: false })
    for (const bad of [null, undefined, 42, {}, [], () => 1]) {
      expect(scoreDomainQuality(bad)).toMatchObject({ ok: false })
    }
  })
})

describe('XSS safety', () => {
  const payloads = [
    '<script>alert(1)</script>.com',
    '"><img src=x onerror=alert(1)>.com',
    "javascript:alert(1)//.com",
    '{{constructor.constructor("alert(1)")()}}.com',
    'marka.com<svg/onload=alert(1)>',
  ]

  it.each(payloads)('rejects %s as invalid input', (payload) => {
    expect(scoreDomainQuality(payload)).toMatchObject({ ok: false })
  })

  it('a successful result only carries a restricted charset, so nothing markup-like can be echoed', () => {
    const result = ok('Çiçek-Evi_1.com')
    expect(result.domain).toMatch(/^[a-z0-9ğüşıöç_.-]+$/)
    expect(result.asciiLabel).toMatch(/^[a-z0-9_-]+$/)
    for (const c of result.criteria) for (const note of c.notes) expect(note).toMatch(/^[a-zA-Z]+$/)
    for (const tip of result.tips) expect(tip).toMatch(/^[a-zA-Z]+$/)
  })

  it('the UI renders the score as React text and never as raw HTML', () => {
    for (const file of [
      'components/domains/domain-quality-score.tsx',
      'components/domains/quality-score-gauge.tsx',
      'components/domains/quality-score-badge.tsx',
    ]) {
      const source = readFileSync(join(root, file), 'utf8')
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/)
    }
  })
})

describe('no outbound requests', () => {
  const files = [
    'lib/domains/quality-score.ts',
    'lib/domains/quality-score-copy.ts',
    'components/domains/domain-quality-score.tsx',
    'components/domains/quality-score-gauge.tsx',
    'components/domains/quality-score-badge.tsx',
  ]

  it.each(files)('%s has no network, storage or server-action calls', (file) => {
    const source = readFileSync(join(root, file), 'utf8')
    expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|node:https?|axios|useSWR|localStorage|sessionStorage|document\.cookie|'use server'/)
  })

  it('the scoring module is pure: no imports, clock or randomness', () => {
    const source = readFileSync(join(root, 'lib/domains/quality-score.ts'), 'utf8')
    expect(source).not.toMatch(/^import\s/m)
    expect(source).not.toMatch(/Date\.now|new Date|Math\.random|process\.env/)
  })
})
