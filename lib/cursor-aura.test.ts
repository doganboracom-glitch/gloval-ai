import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CURSOR_AURA,
  canRunCursorAura,
  hexToRgb,
  parseCursorAuraInput,
  resolveCursorAura,
  withStoredEffects,
} from './cursor-aura'

const enabled = { ...DEFAULT_CURSOR_AURA, enabled: true }

describe('parseCursorAuraInput', () => {
  it('upper-cases valid colours', () => {
    const parsed = parseCursorAuraInput({ ...enabled, colors: ['#6366f1'] })
    expect(parsed?.colors).toEqual(['#6366F1'])
  })

  it('rejects free-form CSS, empty and oversized palettes and out-of-range numbers', () => {
    expect(parseCursorAuraInput({ ...enabled, colors: ['red; background:url(x)'] })).toBeNull()
    expect(parseCursorAuraInput({ ...enabled, colors: [] })).toBeNull()
    expect(parseCursorAuraInput({ ...enabled, colors: Array(7).fill('#112233') })).toBeNull()
    expect(parseCursorAuraInput({ ...enabled, intensity: 5 })).toBeNull()
    expect(parseCursorAuraInput({ ...enabled, size: 10 })).toBeNull()
  })
})

describe('resolveCursorAura', () => {
  it('returns null when missing, disabled or invalid', () => {
    expect(resolveCursorAura(undefined)).toBeNull()
    expect(resolveCursorAura({ cursorAura: DEFAULT_CURSOR_AURA })).toBeNull()
    expect(resolveCursorAura({ cursorAura: { ...enabled, colors: ['nope'] } })).toBeNull()
  })

  it('returns the config when enabled', () => {
    expect(resolveCursorAura({ cursorAura: enabled })?.enabled).toBe(true)
  })
})

describe('withStoredEffects', () => {
  it('discards owner-supplied effects and keeps the stored ones', () => {
    const result = withStoredEffects({ name: 'x', effects: { cursorAura: enabled } }, { effects: { cursorAura: DEFAULT_CURSOR_AURA } })
    expect(result.effects).toEqual({ cursorAura: DEFAULT_CURSOR_AURA })
  })

  it('drops effects entirely when nothing valid is stored', () => {
    const result = withStoredEffects({ name: 'x', effects: { cursorAura: enabled } }, {})
    expect('effects' in result).toBe(false)
  })
})

describe('canRunCursorAura', () => {
  it('only runs on hover-capable fine pointers without reduced motion', () => {
    expect(canRunCursorAura({ reducedMotion: false, coarsePointer: false, noHover: false })).toBe(true)
    expect(canRunCursorAura({ reducedMotion: true, coarsePointer: false, noHover: false })).toBe(false)
    expect(canRunCursorAura({ reducedMotion: false, coarsePointer: true, noHover: false })).toBe(false)
    expect(canRunCursorAura({ reducedMotion: false, coarsePointer: false, noHover: true })).toBe(false)
  })
})

describe('hexToRgb', () => {
  it('converts valid hex and rejects invalid', () => {
    expect(hexToRgb('#6366F1')).toEqual([99, 102, 241])
    expect(hexToRgb('#xyz')).toBeNull()
  })
})
