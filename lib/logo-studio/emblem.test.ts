import { describe, expect, it, vi } from 'vitest'
import type { AiModelSelection } from '@/lib/ai-models'
import { generateEmblemRound, type Drawer } from './emblem-ai'
import { checkEmblemSvg, normalizeViewBox, snapToPalette, unsafeReason } from './emblem-gate'
import { buildEmblemPrompt, compositionFor, objectRankFor, COMPOSITION_HINTS } from './emblem-prompt'
import { METALLIC_TOKEN_COLORS } from './rules'

const PALETTE = ['#1d4ed8', '#f59e0b']
const METALLIC_PALETTE = [METALLIC_TOKEN_COLORS.light, METALLIC_TOKEN_COLORS.mid, METALLIC_TOKEN_COLORS.dark]

const GOOD_METALLIC = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="70" fill="${METALLIC_TOKEN_COLORS.light}"/>
  <path d="M70 100L100 60L130 100L100 140Z" fill="${METALLIC_TOKEN_COLORS.mid}" stroke="${METALLIC_TOKEN_COLORS.dark}" stroke-width="12"/>
</svg>`

const GOOD = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="70" fill="#1d4ed8"/>
  <rect x="80" y="60" width="40" height="80" rx="8" fill="#f59e0b"/>
</svg>`

describe('emblem prompt', () => {
  const base = { brand: 'Kasap Ahmet', sector: 'Kasap', style: 'modern' as const, colors: PALETTE, index: 0, seed: 0 }

  it('keeps hard rules and palette but omits the business name from the emblem prompt', () => {
    const { system, user } = buildEmblemPrompt(
      { ...base, description: 'Kasap Ahmet sells fresh meat and deli goods' },
      4,
    )
    expect(system).toContain('0 0 200 200')
    expect(system).toContain('FORBIDDEN')
    expect(system).toContain('typography')
    expect(system).toContain(PALETTE[0])
    expect(user).not.toContain('"brand_name"')
    expect(user).not.toContain('Kasap Ahmet')
    expect(user).toContain('"industry":"Kasap"')
    expect(user).toContain('"object_rank":1')
    expect(user).toContain('wordmark is typeset separately')
  })

  it('uses a single colour in mono mode', () => {
    const { system, user } = buildEmblemPrompt({ ...base, colors: [PALETTE[0]] }, 4)
    expect(system).toContain('exactly ONE colour')
    expect(user).toContain(`"palette":["${PALETTE[0]}"]`)
  })

  it('labels metallic tones as flat data and forbids copied marks', () => {
    const { system, user } = buildEmblemPrompt(
      {
        ...base,
        v2: true,
        metallic: true,
        colors: METALLIC_PALETTE,
        creativeDirection: 'two interlocking bands',
        motif: 'a hinged clasp',
      },
      4,
    )
    expect(system).toContain('Never imitate or reproduce a recognizable existing logo')
    expect(system).toContain('No gradients or shading in model output')
    expect(user).toContain(`\"palette\":{\"light\":\"${METALLIC_TOKEN_COLORS.light}\",\"mid\":\"${METALLIC_TOKEN_COLORS.mid}\",\"dark\":\"${METALLIC_TOKEN_COLORS.dark}\"}`)
    expect(user).toContain('"creative_direction":"two interlocking bands"')
    expect(user).toContain('"distinctive_object":"a hinged clasp"')
    expect(user).not.toContain('Kasap Ahmet')
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

  it('keeps metallic model shapes flat until the trusted composer runs', async () => {
    const draw: Drawer = async () => ({ text: GOOD_METALLIC, finishReason: 'stop' })
    const [result] = await generateEmblemRound({
      ...round(draw, 1),
      colors: METALLIC_PALETTE,
      v2: true,
      metallic: true,
      motifs: ['a gemstone setting'],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.emblem.inner).not.toMatch(/linearGradient|feGaussianBlur/)
      expect(result.emblem.inner).toContain(METALLIC_TOKEN_COLORS.light)
    }
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

describe('emblem round: Opus -> Sonnet fallback', () => {
  const opus: AiModelSelection = { flow: 'logoEmblem', tier: 'advanced', model: 'anthropic/claude-opus-5.5', plan: 'pro' }
  const SONNET = 'anthropic/claude-sonnet-5.5'
  const round = (draw: Drawer, sel = opus) => ({
    selection: sel,
    brand: 'Kasap Ahmet',
    sector: 'Kasap',
    style: 'modern' as const,
    colors: PALETTE,
    count: 1,
    seed: 0,
    idPrefix: 'ai-0',
    draw,
  })

  it('gives Opus a shorter per-attempt budget than Sonnet', async () => {
    const seen: Record<string, number> = {}
    const draw: Drawer = async ({ model, timeoutMs }) => {
      seen[model] = timeoutMs
      throw Object.assign(new Error('t'), { name: 'TimeoutError' })
    }
    await generateEmblemRound(round(draw))
    expect(seen['anthropic/claude-opus-5.5']).toBe(45_000)
    expect(seen[SONNET]).toBe(60_000)
  })

  it('falls back to Sonnet once in the same round when Opus times out', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const draw = vi
      .fn<Drawer>()
      .mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce({ text: GOOD, finishReason: 'stop' })
    const [o] = await generateEmblemRound(round(draw))
    expect(o).toMatchObject({ ok: true, attempts: 2, model: SONNET, kind: 'fallback' })
    expect(draw.mock.calls.map((c) => c[0].model)).toEqual(['anthropic/claude-opus-5.5', SONNET])
    expect(info).toHaveBeenCalledWith('[logo-emblem] fallback', expect.objectContaining({ cause: 'timeout', to: SONNET }))
    info.mockRestore()
  })

  it('falls back to Sonnet when Opus errors, and gives up after that one extra try', async () => {
    const draw = vi.fn<Drawer>().mockRejectedValue(new Error('gateway 500'))
    const [o] = await generateEmblemRound(round(draw))
    expect(o).toMatchObject({ ok: false, attempts: 2 })
    expect(draw).toHaveBeenCalledTimes(2)
  })

  it('retries a REJECTED Opus draw on Opus itself (kind retried), not on Sonnet', async () => {
    const draw = vi
      .fn<Drawer>()
      .mockResolvedValueOnce({ text: 'no svg', finishReason: 'stop' })
      .mockResolvedValueOnce({ text: GOOD, finishReason: 'stop' })
    const [o] = await generateEmblemRound(round(draw))
    expect(o).toMatchObject({ ok: true, model: 'anthropic/claude-opus-5.5', kind: 'retried' })
  })

  it('has no fallback for Sonnet: an error is retried on Sonnet (kind retried)', async () => {
    const draw = vi
      .fn<Drawer>()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ text: GOOD, finishReason: 'stop' })
    const [o] = await generateEmblemRound(round(draw, selection))
    expect(o).toMatchObject({ ok: true, model: SONNET, kind: 'retried' })
  })
})
