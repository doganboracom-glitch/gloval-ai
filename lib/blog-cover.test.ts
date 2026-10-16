import { describe, expect, it, vi } from 'vitest'
import {
  COVER_NEGATIVE_RULES,
  buildCoverPrompt,
  colorName,
  deriveCoverConcepts,
  generateAcceptedCover,
  heuristicCoverConcepts,
  paletteNames,
  parseCoverStyle,
  sanitizeConcepts,
  type CoverVerdict,
} from '@/lib/blog-cover'

const clean: CoverVerdict = { text: 'clean', people: 'clean' }

describe('parseCoverStyle', () => {
  it('falls back to flat for unknown values', () => {
    expect(parseCoverStyle('photo')).toBe('photo')
    expect(parseCoverStyle('nope')).toBe('flat')
    expect(parseCoverStyle(undefined)).toBe('flat')
  })
})

describe('heuristicCoverConcepts', () => {
  it('matches whole words only', () => {
    expect(heuristicCoverConcepts('Yapay zeka ile içerik')).toContain('network of connected nodes')
    // "ev" must not match inside "devam"
    expect(heuristicCoverConcepts('devam eden süreç')).toContain('lightbulb')
  })
})

describe('sanitizeConcepts', () => {
  it('strips digits and symbols and rejects too-short or non-English replies', () => {
    expect(sanitizeConcepts('a lightbulb, a "key", 3 gears')).toBe('a lightbulb, a key, gears')
    expect(sanitizeConcepts('lamba')).toBeNull()
    expect(sanitizeConcepts('yapay zekâ şeffaflık ışık çözüm')).toBeNull()
  })
})

describe('deriveCoverConcepts', () => {
  it('uses the model reply when valid', async () => {
    const complete = vi.fn().mockResolvedValue('a warning sign, a flow diagram, a lightbulb')
    const result = await deriveCoverConcepts({ title: 'Yapay zeka' }, { complete })
    expect(result).toEqual({ concepts: 'a warning sign, a flow diagram, a lightbulb', source: 'model' })
  })

  it('falls back when the model fails or answers badly', async () => {
    const failing = await deriveCoverConcepts({ title: 'SEO rehberi' }, { complete: () => Promise.reject(new Error('x')) })
    expect(failing.source).toBe('fallback')
    const bad = await deriveCoverConcepts({ title: 'SEO rehberi' }, { complete: async () => 'ok' })
    expect(bad.source).toBe('fallback')
  })
})

describe('palette', () => {
  it('names colors and never emits hex codes', () => {
    expect(colorName('#ffffff')).toBe('off-white')
    expect(colorName('#2563eb')).toBe('blue')
    expect(colorName('nope')).toBeNull()
    expect(paletteNames([{ hex: '#2563eb' }, { hex: '#2564ec' }, { hex: '#ffffff' }])).toEqual(['blue', 'off-white'])
  })
})

describe('buildCoverPrompt', () => {
  it('never contains the title and always carries the negative rules', () => {
    const title = 'Yapay Zeka Çağında Güven'
    const concepts = heuristicCoverConcepts(title)
    for (const style of ['flat', 'photo', 'gradient'] as const) {
      const prompt = buildCoverPrompt({ concepts, style, colors: ['blue'] })
      expect(prompt).not.toContain('Güven')
      expect(prompt).toContain(COVER_NEGATIVE_RULES)
      expect(prompt).not.toMatch(/#[0-9a-f]{3,6}/i)
    }
  })
})

describe('generateAcceptedCover', () => {
  it('accepts a clean first image', async () => {
    const result = await generateAcceptedCover({
      generate: async () => ({ src: 'a' }),
      inspect: async () => clean,
    })
    expect(result).toEqual({ ok: true, src: 'a', attempts: 1 })
  })

  it('retries once after a rejected image and then accepts', async () => {
    const srcs = ['bad', 'good']
    const result = await generateAcceptedCover({
      generate: async () => ({ src: srcs.shift() as string }),
      inspect: async (src) => (src === 'bad' ? { text: 'text', people: 'clean' } : clean),
    })
    expect(result).toEqual({ ok: true, src: 'good', attempts: 2 })
  })

  it('rejects after two bad images so nothing is charged', async () => {
    const result = await generateAcceptedCover({
      generate: async () => ({ src: 'x' }),
      inspect: async () => ({ text: 'clean', people: 'people' }),
    })
    expect(result).toEqual({ ok: false, reason: 'rejected', attempts: 2 })
  })

  it('reports generation failure when no image is produced', async () => {
    const result = await generateAcceptedCover({ generate: async () => null, inspect: async () => clean })
    expect(result).toEqual({ ok: false, reason: 'generation_failed', attempts: 2 })
  })

  it('accepts when the check is unavailable', async () => {
    const result = await generateAcceptedCover({
      generate: async () => ({ src: 'a' }),
      inspect: async () => ({ text: 'unknown', people: 'unknown' }),
    })
    expect(result.ok).toBe(true)
  })
})
