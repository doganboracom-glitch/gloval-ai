import { describe, expect, it, vi } from 'vitest'
import type { AiModelSelection } from '@/lib/ai-models'
import { generateEmblemRound, type Drawer } from './emblem-ai'
import { checkEmblemSvg, normalizeViewBox, snapToPalette, unsafeReason } from './emblem-gate'
import { buildEmblemPrompt, compositionFor, objectRankFor, COMPOSITION_HINTS } from './emblem-prompt'

const PALETTE = ['#1d4ed8', '#f59e0b']

const GOOD = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="70" fill="#1d4ed8"/>
  <rect x="80" y="60" width="40" height="80" rx="8" fill="#f59e0b"/>
</svg>`

describe('emblem prompt', () => {
  const base = { brand: 'Kasap Ahmet', sector: 'Kasap', style: 'modern' as const, colors: PALETTE, index: 0, seed: 0 }

  it('keeps hard rules, palette and brief as data', () => {
    const { system, user } = buildEmblemPrompt(base, 4)
    expect(system).toContain('0 0 200 200')
    expect(system).toContain('FORBIDDEN')
    expect(system).toContain(PALETTE[0])
    expect(user).toContain('"brand_name":"Kasap Ahmet"')
    expect(user).toContain('"object_rank":1')
  })

  it('uses a single colour in mono mode', () => {
    const { system, user } = buildEmblemPrompt({ ...base, colors: [PALETTE[0]] }, 4)
    expect(system).toContain('exactly ONE colour')
    expect(user).toContain(`"palette":["${PALETTE[0]}"]`)
  })

  it('gives each candidate of a round a different composition and rank', () => {
    const hints = new Set([0, 1, 2, 3].map((i) => compositionFor(i, 0).id))
    expect(hints.size).toBe(COMPOSITION_HINTS.length)
    expect(new Set([0, 1, 2, 3].map((i) => objectRankFor(i, 0, 4))).size).toBe(4)
  })

  it('moves to new ranks on "Başka öner" and wraps around', () => {
    expect(objectRankFor(0, 1, 4)).toBe(5)
    expect(objectRankFor(0, 2, 4)).toBe(1)
  })

  it('carries the retry reason', () => {
    const { user } = buildEmblemPrompt({ ...base, retryReason: 'boş çıktı' }, 4)
    expect(user).toContain('previous_attempt_problem')
    expect(user).toContain('boş çıktı')
  })
})

describe('emblem gate', () => {
  it('accepts a clean emblem and keeps only palette colours', async () => {
    const v = await checkEmblemSvg(`\`\`\`svg\n${GOOD}\n\`\`\``, PALETTE)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.svg).toContain('viewBox="0 0 200 200"')
      expect(v.svg).not.toMatch(/#(?!1d4ed8|f59e0b)[0-9a-f]{3,6}/i)
    }
  })

  it.each([
    ['script', GOOD.replace('</svg>', '<script>alert(1)</script></svg>')],
    ['event handler', GOOD.replace('<circle', '<circle onload="x()"')],
    ['external href', GOOD.replace('<circle', '<a href="https://evil.test"><circle').replace('/>', '/></a>')],
    ['gradient', GOOD.replace('<circle', '<defs><linearGradient id="g"/></defs><circle')],
    ['url()', GOOD.replace('fill="#1d4ed8"', 'fill="url(#g)"')],
    ['text', GOOD.replace('</svg>', '<text x="10" y="10">AB</text></svg>')],
  ])('rejects %s', async (_name, svg) => {
    expect((await checkEmblemSvg(svg, PALETTE)).ok).toBe(false)
  })

  it('rejects background rects and full-box fills', async () => {
    const bg = `<svg viewBox="0 0 200 200"><rect width="200" height="200" fill="#1d4ed8"/><circle cx="100" cy="100" r="30" fill="#f59e0b"/></svg>`
    const v = await checkEmblemSvg(bg, PALETTE)
    expect(v.ok).toBe(false)
  })

  it('rejects blank output and non-svg replies', async () => {
    expect((await checkEmblemSvg('Sorry, I cannot', PALETTE)).ok).toBe(false)
    expect((await checkEmblemSvg('<svg viewBox="0 0 200 200"><g/></svg>', PALETTE)).ok).toBe(false)
  })

  it('rejects too many shapes', async () => {
    const many = Array.from({ length: 60 }, (_, i) => `<circle cx="${(i % 10) * 18 + 10}" cy="${Math.floor(i / 10) * 30 + 20}" r="6" fill="#1d4ed8"/>`).join('')
    expect((await checkEmblemSvg(`<svg viewBox="0 0 200 200">${many}</svg>`, PALETTE)).ok).toBe(false)
  })

  it('scales other viewBoxes into 0 0 200 200', () => {
    const out = normalizeViewBox('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>')
    expect(out).toContain('viewBox="0 0 200 200"')
    expect(out).toContain('scale(2)')
  })

  it('snaps off-palette colours to the nearest token and counts them', () => {
    const r = snapToPalette('<svg viewBox="0 0 200 200"><circle fill="#ff0000"/><rect stroke="white" fill="none"/></svg>', PALETTE)
    expect(r).not.toBeNull()
    expect(r!.offPalette).toBe(2)
    expect(r!.svg).toContain('fill="#f59e0b"')
    expect(r!.svg).toContain('fill="none"')
  })

  it('flags unsafe markup directly', () => {
    expect(unsafeReason(GOOD)).toBeNull()
    expect(unsafeReason('<svg><image href="x"/></svg>')).not.toBeNull()
  })
})

const selection: AiModelSelection = { flow: 'logoEmblem', tier: 'standard', model: 'anthropic/claude-sonnet-5.5', plan: 'free' }

describe('emblem round', () => {
  const round = (draw: Drawer, count = 2) => ({
    selection,
    brand: 'Kasap Ahmet',
    sector: 'Kasap',
    style: 'modern' as const,
    colors: PALETTE,
    count,
    seed: 0,
    idPrefix: 'ai-0',
    draw,
  })

  it('returns gated emblems with stable ids', async () => {
    const draw: Drawer = async () => ({ text: GOOD, finishReason: 'stop' })
    const out = await generateEmblemRound(round(draw))
    expect(out.every((o) => o.ok && o.attempts === 1)).toBe(true)
    expect(out.map((o) => (o.ok ? o.emblem.id : ''))).toEqual(['ai-0-0', 'ai-0-1'])
  })

  it('retries once with the rejection reason, then succeeds', async () => {
    const draw = vi
      .fn<Drawer>()
      .mockResolvedValueOnce({ text: 'no svg here', finishReason: 'stop' })
      .mockResolvedValueOnce({ text: GOOD, finishReason: 'stop' })
    const [o] = await generateEmblemRound(round(draw, 1))
    expect(o).toMatchObject({ ok: true, attempts: 2 })
    expect(draw.mock.calls[1][0].prompt).toContain('previous_attempt_problem')
  })

  it('fails after two bad attempts and reports the reason (no charge path)', async () => {
    const draw: Drawer = async () => ({ text: 'nope', finishReason: 'stop' })
    const [o] = await generateEmblemRound(round(draw, 1))
    expect(o).toMatchObject({ ok: false, attempts: 2 })
  })

  it('treats truncated output and thrown errors as failures without throwing', async () => {
    const truncated: Drawer = async () => ({ text: GOOD, finishReason: 'length' })
    const [a] = await generateEmblemRound(round(truncated, 1))
    expect(a.ok).toBe(false)
    const boom: Drawer = async () => {
      throw new Error('gateway down')
    }
    const [b] = await generateEmblemRound(round(boom, 1))
    expect(b).toMatchObject({ ok: false, reason: 'model hatası' })
  })

  it('skips the retry once the round deadline has passed', async () => {
    let t = 0
    const draw = vi.fn<Drawer>(async () => {
      t += 200_000
      return { text: 'nope', finishReason: 'stop' }
    })
    const [o] = await generateEmblemRound({ ...round(draw, 1), now: () => t })
    expect(o).toMatchObject({ ok: false, attempts: 1 })
    expect(draw).toHaveBeenCalledTimes(1)
  })
})
