import { describe, expect, it } from 'vitest'
import { deriveSeoTitle, detectSector, sectorPromptHint } from './sector-profiles'
import { RADIO_STATION_BRIEF } from './__fixtures__/radio-station'
import { starterSectorFor } from './starter-blog'

describe('radio / broadcasting profile', () => {
  it('keeps the coarse sector neutral but adds radio-specific visual and SEO guidance', () => {
    expect(detectSector(RADIO_STATION_BRIEF)).toBe('default')
    expect(deriveSeoTitle(RADIO_STATION_BRIEF, 'default', 'tr')).toBe('İstanbul Radyo ve Yayıncılık')
    expect(sectorPromptHint(RADIO_STATION_BRIEF)).toContain('radio station / broadcaster')
    expect(sectorPromptHint(RADIO_STATION_BRIEF)).toContain('audio mixing console')
  })
})

describe('detectSector: technical service', () => {
  it('does not treat a boiler/AC service as a beauty salon', () => {
    expect(detectSector('Teknik Servis Pro kombi klima bakım ve onarım')).toBe('default')
    expect(starterSectorFor({ name: 'Teknik Servis Pro', description: 'Kombi ve klima bakımı', storefront: false })).toBe('default')
  })

  it('still detects a real beauty salon', () => {
    expect(detectSector('Cilt bakımı ve güzellik salonu')).toBe('beauty')
  })

  it('keeps e-commerce intent on top', () => {
    expect(detectSector('klima satışı için e-ticaret sitesi')).toBe('ecommerce')
  })
})
