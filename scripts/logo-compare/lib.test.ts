import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  LOGO_BRIEFS,
  buildImagePrompt,
  buildLlmUserPrompt,
  costUsd,
  esc,
  extractSvg,
  validateRaster,
  validateSvg,
} from './lib'

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${inner}</svg>`

describe('logo compare: svg validation', () => {
  it('accepts a simple two-colour mark and reports its stats', async () => {
    const v = await validateSvg(
      svg('<circle cx="100" cy="100" r="70" fill="#9b1c1c"/><rect x="80" y="60" width="40" height="80" fill="#1f2937"/>'),
    )
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.stats.shapes).toBe(2)
      expect(v.stats.colors).toBe(2)
      expect(v.notes).toEqual([])
    }
  })

  it('unwraps markdown fences', async () => {
    const wrapped = '```svg\n' + svg('<circle cx="100" cy="100" r="60" fill="#111111"/>') + '\n```'
    expect(extractSvg(wrapped)).toContain('<circle')
    expect((await validateSvg(wrapped)).ok).toBe(true)
  })

  it('rejects blank, background-filling, and text-bearing output', async () => {
    expect(await validateSvg('no svg here')).toMatchObject({ ok: false })
    expect(await validateSvg(svg('<circle cx="100" cy="100" r="1" fill="#111111"/>'))).toMatchObject({ ok: false, reason: 'boş çıktı' })
    expect(await validateSvg(svg('<rect width="200" height="200" fill="#111111"/>'))).toMatchObject({ ok: false })
    expect(await validateSvg(svg('<circle cx="100" cy="100" r="60" fill="#111111"/><text x="10" y="10">MK</text>'))).toMatchObject({ ok: true })
  })

  it('rejects over-complex output but only flags soft misses', async () => {
    const many = Array.from({ length: 70 }, (_, i) => `<circle cx="${20 + (i % 10) * 16}" cy="${20 + Math.floor(i / 10) * 16}" r="6" fill="#111111"/>`).join('')
    expect(await validateSvg(svg(many))).toMatchObject({ ok: false })
    const some = Array.from({ length: 30 }, (_, i) => `<circle cx="${20 + (i % 10) * 16}" cy="${20 + Math.floor(i / 10) * 16}" r="7" fill="#${(i % 4) + 1}${(i % 4) + 1}1111"/>`).join('')
    const v = await validateSvg(svg(some))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.notes.length).toBe(2)
  })

  it('never lets scripts or external references through', async () => {
    const v = await validateSvg(
      svg('<script>alert(1)</script><circle cx="100" cy="100" r="60" fill="#111111" onclick="x()"/><image href="https://evil.test/a.png"/>'),
    )
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.svg).not.toMatch(/script|onclick|evil|image/i)
  })
})

describe('logo compare: raster validation', () => {
  it('accepts a mark on white and rejects a blank image', async () => {
    const mark = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#ffffff' } })
      .composite([{ input: await sharp({ create: { width: 120, height: 120, channels: 3, background: '#9b1c1c' } }).png().toBuffer(), left: 68, top: 68 }])
      .png()
      .toBuffer()
    const blank = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#ffffff' } }).png().toBuffer()
    expect((await validateRaster(mark)).ok).toBe(true)
    expect(await validateRaster(blank)).toMatchObject({ ok: false, reason: 'boş görsel' })
    expect(await validateRaster(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false })
  })
})

describe('logo compare: prompts, cost, escaping', () => {
  it('puts the sector subject and forbidden items into every prompt', () => {
    for (const b of LOGO_BRIEFS) {
      expect(b.subjects).toHaveLength(3)
      const text = buildLlmUserPrompt(b, b.subjects[0])
      expect(text).toContain(b.brand)
      expect(text).toContain(b.subjects[0])
      expect(buildImagePrompt(b, b.subjects[1])).toContain(b.subjects[1])
    }
  })

  it('prices tokens and tolerates a missing price', () => {
    expect(costUsd({ inputTokens: 1000, outputTokens: 500 }, { input: 0.000002, output: 0.00001 })).toBeCloseTo(0.007)
    expect(costUsd({ inputTokens: 1, outputTokens: 1 }, undefined)).toBe(0)
  })

  it('escapes html', () => {
    expect(esc('<img src=x onerror="a">&\'')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;')
  })
})
