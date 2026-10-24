import { describe, expect, it } from 'vitest'
import { groundAboutCopy, seedAboutCopy } from '@/lib/about-copy-ai'
import { fallbackWebsite, type Section } from '@/lib/website-schema'

type About = Extract<Section, { type: 'about' }>

const FACTS = ['Atölye Kahve', 'Taze çekirdek kavurur, filtre kahve ve espresso sunarız.']

function aboutOf(site: ReturnType<typeof fallbackWebsite>): About {
  return site.sections.find((s) => s.type === 'about') as About
}

describe('groundAboutCopy', () => {
  it('keeps safe copy and clamps every field', () => {
    const out = groundAboutCopy(
      {
        shortText: 'Taze kahve sunarız. Espresso hazırlarız. Filtre kahve de var. Dördüncü cümle.',
        longText: 'Taze çekirdek kavururuz. Filtre kahve sunarız. Espresso hazırlarız. Her fincana özen gösteririz. Beşinci cümle.',
        vision: 'Kahveyi herkese sevdirmek. İkinci. Üçüncü.',
        mission: 'Taze kahve sunmak.',
      },
      FACTS,
    )
    expect(out).not.toBeNull()
    expect(out!.shortText!.split('. ').length).toBeLessThanOrEqual(3)
    expect(out!.longText).toContain('Her fincana özen gösteririz.')
    expect(out!.longText).not.toContain('Beşinci')
    expect(out!.vision).not.toContain('Üçüncü')
  })

  it('removes invented numbers, awards, founding years and names but keeps the rest', () => {
    const out = groundAboutCopy(
      {
        shortText: 'Taze kahve sunarız. 2008 yılında kurulduk. Ödüllü ekibimiz var.',
        longText: 'Kurucumuz Ali Veli bu işe başladı. 500 müşteriye hizmet verdik.',
        vision: 'Yıllardır en iyisi olmak.',
        mission: 'Espresso hazırlamak.',
      },
      FACTS,
    )
    expect(out).toEqual({ shortText: 'Taze kahve sunarız.', mission: 'Espresso hazırlamak.' })
  })

  it('returns null when the home teaser has nothing safe, so the legacy look stays', () => {
    expect(
      groundAboutCopy(
        { shortText: '1999 yılında kurulduk.', longText: 'Taze kahve sunarız.', vision: 'Taze kahve.', mission: 'Espresso.' },
        FACTS,
      ),
    ).toBeNull()
  })
})

describe('seedAboutCopy', () => {
  it('writes copy onto an about section that has none', () => {
    const site = fallbackWebsite('kahve atölyesi', 'tr')
    const seeded = seedAboutCopy(site, { shortText: 'Kısa.', vision: 'Vizyon.' })
    expect(aboutOf(seeded).shortText).toBe('Kısa.')
    expect(aboutOf(seeded).vision).toBe('Vizyon.')
  })

  it('never overwrites owner copy and ignores empty input', () => {
    const site = fallbackWebsite('kahve atölyesi', 'tr')
    const owned = seedAboutCopy(site, { shortText: 'Sahip metni.' })
    expect(seedAboutCopy(owned, { shortText: 'AI metni.' })).toBe(owned)
    expect(seedAboutCopy(site, null)).toBe(site)
    expect(seedAboutCopy(site, undefined)).toBe(site)
  })
})
