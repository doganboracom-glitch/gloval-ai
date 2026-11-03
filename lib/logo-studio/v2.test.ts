import { describe, expect, it } from 'vitest'
import { EMBLEM_LIBRARY, SECTOR_IDS, pickLocalEmblems } from './emblem-local'
import { LOGO_STUDIO_V2_SHOWCASE_FIXTURES } from './v2-fixtures'
import {
  hasAllLegacyLogoSectors,
  isLogoStudioV2Enabled,
  LOGO_STUDIO_SECTORS,
  MAX_LOGO_STUDIO_DIRECTION,
  MAX_LOGO_STUDIO_NOTES,
  logoStudioMotifFor,
  logoStudioLocale,
  recommendedLogoStyle,
  resolveLogoStudioSector,
  resolveLogoStudioV2Input,
  sectorLabelStyle,
} from './v2'

function request(overrides: Partial<Parameters<typeof resolveLogoStudioV2Input>[0]> = {}) {
  return resolveLogoStudioV2Input({
    sectorId: 'beauty',
    industryNotes: 'Kişiye özel gümüş takılar',
    creativeDirection: 'Dört parçalı taş yuvası',
    brand: 'Luna Atelier',
    locale: 'tr',
    ...overrides,
  })
}

describe('logo studio V2 flag and sectors', () => {
  it('is disabled unless LOGO_STUDIO_V2 is explicitly set to 1', () => {
    expect(isLogoStudioV2Enabled(undefined)).toBe(false)
    expect(isLogoStudioV2Enabled('')).toBe(false)
    expect(isLogoStudioV2Enabled('true')).toBe(false)
    expect(isLogoStudioV2Enabled('1')).toBe(true)
  })

  it('keeps all 16 legacy sectors and adds a separate Other choice', () => {
    expect(hasAllLegacyLogoSectors()).toBe(true)
    expect(LOGO_STUDIO_SECTORS).toHaveLength(SECTOR_IDS.length + 1)
    expect(new Set(LOGO_STUDIO_SECTORS.map((sector) => sector.id)).size).toBe(LOGO_STUDIO_SECTORS.length)
    for (const id of SECTOR_IDS) expect(LOGO_STUDIO_SECTORS.some((sector) => sector.id === id)).toBe(true)
    expect(resolveLogoStudioSector('other', 'tr')).toMatchObject({ id: 'other', localId: 'generic', label: 'Diğer' })
  })

  it('uses the explicitly selected sector instead of guessing from audience notes', () => {
    const parsed = request({ sectorId: 'legal', industryNotes: 'Restoran yöneticileri için hukuk bürosu' })
    expect(parsed).toMatchObject({ ok: true, value: { sectorId: 'legal', localSectorId: 'legal', sectorLabel: 'Hukuk ve finans' } })
    if (parsed.ok) expect(parsed.value.sectorPrompt).toContain('balanced beam scale')

    const picks = pickLocalEmblems({
      count: 4,
      brand: 'LUNA',
      context: 'law office restaurant menu',
      seed: 0,
      sectorId: 'beauty',
    })
    expect(picks).toHaveLength(4)
    expect(picks.every((pick) => EMBLEM_LIBRARY.find((emblem) => emblem.id === pick.entry)?.sector === 'beauty')).toBe(true)
  })

  it('defaults a missing sector to Other and never adds the brand name to the brief', () => {
    const parsed = request({ sectorId: undefined, creativeDirection: '' })
    expect(parsed).toMatchObject({ ok: true, value: { sectorId: 'other', localSectorId: 'generic', sectorLabel: 'Diğer' } })
    if (parsed.ok) expect(parsed.value.sectorPrompt).not.toContain('Luna Atelier')
  })

  it('validates note and direction length and rejects markup-like input', () => {
    expect(request({ industryNotes: 'a'.repeat(MAX_LOGO_STUDIO_NOTES) }).ok).toBe(true)
    expect(request({ industryNotes: 'a'.repeat(MAX_LOGO_STUDIO_NOTES + 1) })).toEqual({ ok: false, error: 'invalid_notes' })
    expect(request({ creativeDirection: 'a'.repeat(MAX_LOGO_STUDIO_DIRECTION) }).ok).toBe(true)
    expect(request({ creativeDirection: 'a'.repeat(MAX_LOGO_STUDIO_DIRECTION + 1) })).toEqual({ ok: false, error: 'invalid_direction' })
    expect(request({ creativeDirection: 'badge <svg>' })).toEqual({ ok: false, error: 'invalid_direction' })
  })

  it('blocks the exact brand name in creative direction without rejecting an unrelated word', () => {
    expect(request({ creativeDirection: 'Use Luna Atelier lettering' })).toEqual({ ok: false, error: 'brand_name_in_direction' })
    expect(request({ creativeDirection: 'Use a lunar crescent, no lettering' }).ok).toBe(true)
  })

  it('normalizes locale and selects sector-and-tone type pairings from existing styles', () => {
    expect(logoStudioLocale('tr-TR')).toBe('tr')
    expect(logoStudioLocale('en-US')).toBe('en')
    expect(recommendedLogoStyle('beauty', 'gold')).toBe('luxury')
    expect(recommendedLogoStyle('construction', 'silver')).toBe('minimal')
    expect(recommendedLogoStyle('legal', 'gold')).toBe('classic')
    expect(sectorLabelStyle('silver')).toBe('modern')
    expect(sectorLabelStyle('bronze')).toBe('minimal')
  })

  it('uses four distinct motif suggestions per fixture and retains five motifs per local sector', () => {
    expect(LOGO_STUDIO_V2_SHOWCASE_FIXTURES).toHaveLength(5)
    expect(new Set(LOGO_STUDIO_V2_SHOWCASE_FIXTURES.map((fixture) => fixture.sectorId)).size).toBe(5)

    for (const fixture of LOGO_STUDIO_V2_SHOWCASE_FIXTURES) {
      const motifs = new Set([0, 1, 2, 3].map((index) => logoStudioMotifFor(fixture.sectorId, index, 0, 4)))
      expect(motifs.size).toBe(4)
    }
    for (const sectorId of SECTOR_IDS) {
      const motifIds = new Set(
        EMBLEM_LIBRARY.filter((emblem) => emblem.sector === sectorId).map((emblem) => emblem.glyph),
      )
      expect(motifIds.size).toBeGreaterThanOrEqual(5)
    }
  })
})
