import { describe, expect, it } from 'vitest'
import { classify, collateralPaths, diffPaths } from './evaluate'
import { CASES } from './cases'
import { clinicFixture, hueOf, storeFixture } from './fixtures'
import { runClientStage } from './pipeline'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

describe('evaluate', () => {
  it('diffs nested paths', () => {
    expect(diffPaths({ a: { b: 1, c: [1, 2] } }, { a: { b: 2, c: [1, 3] } }).sort()).toEqual(['a.b', 'a.c.1'])
  })
  it('flags collateral outside allowed prefixes', () => {
    expect(collateralPaths(['sections.0.title', 'theme.mode'], ['sections'])).toEqual(['theme.mode'])
  })
  it('classifies outcomes', () => {
    expect(classify({ kind: 'change', changed: false, checks: [], collateral: [] })).toBe('etkisiz')
    expect(classify({ kind: 'change', changed: true, checks: [{ label: 'x', pass: true }], collateral: [] })).toBe('başarı')
    expect(classify({ kind: 'change', changed: true, checks: [{ label: 'x', pass: false }], collateral: [] })).toBe('yanlış')
    expect(classify({ kind: 'no-change', changed: true, checks: [], collateral: [] })).toBe('yanlış')
  })
  it('hueOf recognises red and green', () => {
    expect(hueOf('#dc2626')!.h).toBeLessThan(20)
    expect(hueOf('#16a34a')!.h).toBeGreaterThan(90)
  })
})

describe('cases', () => {
  it('has 30 unique cases with every required category', () => {
    expect(CASES).toHaveLength(30)
    expect(new Set(CASES.map((c) => c.id)).size).toBe(30)
    for (const c of CASES) {
      if (c.kind === 'change' && !c.imageTarget) expect(c.checks, c.id).toBeTypeOf('function')
    }
  })
  it('fixtures validate and the store fixture is a storefront', () => {
    expect(clinicFixture().sections.length).toBeGreaterThan(3)
    expect(storeFixture().sections.some((s) => s.type === 'products')).toBe(true)
  })
  it('image cases resolve to the image pipeline', () => {
    for (const c of CASES.filter((x) => x.imageTarget)) {
      const site = c.fixture === 'store' ? storeFixture() : clinicFixture()
      expect(runClientStage(c.instruction, site).stage, c.id).toBe('image')
    }
  })
})

describe('pipeline mirror', () => {
  it('keeps the same client step order as website-preview.tsx', () => {
    const src = readFileSync(path.resolve(__dirname, '../../components/website-preview.tsx'), 'utf8')
    const a = src.indexOf('hasImageMention(a)')
    const b = src.indexOf('detectImageEditIntent(instruction, currentSite)')
    const c = src.indexOf('parseCommand(')
    expect(a).toBeGreaterThan(-1)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })
})
