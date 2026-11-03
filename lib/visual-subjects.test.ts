import { describe, expect, it } from 'vitest'
import {
  describeVisualRequest,
  findGeneratedTopic,
  resolveVisualTopic,
  stripImagePromptBoilerplate,
  variationCue,
} from './visual-subjects'
import { analyzeBrief, buildHeroImagePrompt } from './hero-image'
import { FIXED_IMAGE_NEGATIVE_TERMS } from './image-prompt-rules'
import { deriveSeoTitle, detectSector, sectorPromptHint } from './sector-profiles'
import { RADIO_STATION_BRIEF } from './__fixtures__/radio-station'

describe('resolveVisualTopic: yoga / pilates / fitness', () => {
  it('maps yoga to a calm yoga studio, not a gym', () => {
    const topic = resolveVisualTopic('Yoga stüdyosu için sakin bir açılış sayfası oluştur')
    expect(topic?.business).toBe('yoga studio')
    expect(topic?.subject).toMatch(/yoga mats/)
    expect(topic?.subject).toMatch(/natural light/)
    expect(topic?.subject).not.toMatch(/matte black equipment|athlete/)
  })

  it('maps pilates to a reformer studio, not a gym', () => {
    const topic = resolveVisualTopic('İstanbul pilates stüdyosu web sitesi')
    expect(topic?.business).toBe('pilates studio')
    expect(topic?.subject).toMatch(/reformer/)
    expect(topic?.subject).not.toMatch(/matte black equipment|athlete/)
  })

  it('keeps generic fitness and gym on the gym topic', () => {
    for (const prompt of ['fitness salonu sitesi', 'fitness club website', 'a gym landing page', 'crossfit box']) {
      const topic = resolveVisualTopic(prompt)
      expect(topic?.business, prompt).toBe('fitness studio / gym')
      expect(topic?.subject, prompt).toMatch(/gym interior/)
    }
  })
})

describe('resolveVisualTopic: Turkish "spor salonu" phrasing', () => {
  it('maps natural spor salonu phrases to the gym topic', () => {
    for (const prompt of [
      'Spor salonu için web sitesi',
      'spor salonu web sitesi',
      'İstanbul spor salonları için bir site oluştur',
      'Crossfit salonu',
      'fitness studio',
    ]) {
      const topic = resolveVisualTopic(prompt)
      expect(topic?.business, prompt).toBe('fitness studio / gym')
      expect(topic?.subject, prompt).toMatch(/gym interior/)
    }
  })

  it('keeps yoga and pilates studios off the gym topic', () => {
    expect(resolveVisualTopic('Yoga stüdyosu için web sitesi')?.business).toBe('yoga studio')
    expect(resolveVisualTopic('Pilates stüdyosu için web sitesi')?.business).toBe('pilates studio')
  })
})

describe('hero image chain keeps yoga / pilates topics', () => {
  it('does not turn yoga back into a gym in analyzeBrief or the prompt', () => {
    const brief = analyzeBrief('Yoga stüdyosu için sakin bir açılış sayfası oluştur')
    expect(brief.businessType).toBe('yoga studio')
    const prompt = buildHeroImagePrompt(brief)
    expect(prompt).toMatch(/yoga mats/)
    expect(prompt).toMatch(/for a yoga studio/)
    expect(prompt).not.toMatch(/gym/i)
  })

  it('does not turn pilates back into a gym in analyzeBrief or the prompt', () => {
    const brief = analyzeBrief('A boutique pilates studio website')
    expect(brief.businessType).toBe('pilates studio')
    const prompt = buildHeroImagePrompt(brief)
    expect(prompt).toMatch(/reformer/)
    expect(prompt).toMatch(/for a pilates studio/)
    expect(prompt).not.toMatch(/gym/i)
  })

  it('still builds a gym prompt for generic fitness', () => {
    const brief = analyzeBrief('modern fitness gym website')
    expect(brief.businessType).toBe('fitness studio / gym')
    expect(buildHeroImagePrompt(brief)).toMatch(/gym interior/)
  })

  it('does not change how the sector is detected', () => {
    expect(typeof detectSector('Yoga stüdyosu')).toBe('string')
  })
})

describe('deriveSeoTitle: yoga / pilates / fitness', () => {
  it('labels yoga and pilates as studios and keeps the gym label for fitness', () => {
    expect(deriveSeoTitle('Yoga stüdyosu sitesi', 'default', 'tr')).toBe('Yoga Stüdyosu')
    expect(deriveSeoTitle('Pilates stüdyosu sitesi', 'default', 'tr')).toBe('Pilates Stüdyosu')
    expect(deriveSeoTitle('Yoga studio site', 'default', 'en')).toBe('Yoga Studio')
    expect(deriveSeoTitle('spor salonu sitesi', 'default', 'tr')).toBe('Spor Salonu')
    expect(deriveSeoTitle('fitness club site', 'default', 'en')).toBe('Fitness Studio')
  })
})

describe('butcher vs grocery', () => {
  it('maps a butcher to a meat counter, not produce', () => {
    const topic = resolveVisualTopic('Mahalle Kasabı için web sitesi')
    expect(topic?.business).toBe('butcher shop')
    expect(topic?.subject).toMatch(/meat/)
    expect(topic?.avoid).toMatch(/vegetables/)
    expect(resolveVisualTopic('manav sitesi')?.business).toBe('grocery store / greengrocer')
  })
})

describe('radio / broadcasting visual topic', () => {
  it('resolves Turkish and English radio briefs to studio equipment and music', () => {
    for (const brief of [RADIO_STATION_BRIEF, 'Radio station website with live broadcasting and music']) {
      const topic = resolveVisualTopic(brief)
      expect(topic?.business, brief).toBe('radio station / broadcaster')
      expect(topic?.subject, brief).toMatch(/radio studio/i)
      expect(topic?.subject, brief).toMatch(/microphone/i)
      expect(topic?.subject, brief).toMatch(/mixing console/i)
      expect(topic?.subject, brief).toMatch(/headphones/i)
      expect(topic?.subject, brief).toMatch(/music/i)
      expect(topic?.avoid, brief).toMatch(/bakery/i)
    }
  })

  it('keeps the radio scene in hero, sector guidance, SEO and translated visual terms', () => {
    const brief = analyzeBrief(RADIO_STATION_BRIEF)
    expect(brief.sector).toBe('default')
    expect(brief.confidence).toBe('high')
    expect(brief.businessType).toBe('radio station / broadcaster')

    const heroPrompt = buildHeroImagePrompt(brief)
    expect(heroPrompt).toContain('audio mixing console')
    expect(heroPrompt).toContain('over-ear headphones')
    expect(sectorPromptHint(RADIO_STATION_BRIEF)).toContain(brief.visualNeed)
    expect(deriveSeoTitle(RADIO_STATION_BRIEF, 'default', 'tr')).toBe('İstanbul Radyo ve Yayıncılık')
    expect(deriveSeoTitle('Radio station website', 'default', 'en')).toBe('Radio Broadcasting')

    const translated = describeVisualRequest('Radyo stüdyosu: mikrofon, mikser, kulaklık ve müzik')
    expect(translated).toContain('radio broadcasting studio')
    expect(translated).toContain('audio mixing console')
    expect(translated).toContain('over-ear studio headphones')
  })

  it('does not confuse radiotherapy or music education with a radio station', () => {
    expect(resolveVisualTopic('Radyoterapi kliniği')).toBeNull()
    expect(resolveVisualTopic('Music school website')).toBeNull()
  })
})

describe('event and entertainment visual topics', () => {
  it.each([
    ['DJ Performans sitesi', 'live music & nightlife venue', /DJ performing/i],
    ['Gece kulübü web sitesi', 'live music & nightlife venue', /DJ performing/i],
    ['Müzik grubu ve konser sitesi', 'live music & nightlife venue', /concert lighting/i],
    ['Music school website', null, null],
    ['Wedding organizer website', 'wedding planning & celebration', /wedding reception/i],
    ['Parti ve etkinlik organizasyon firması', 'event planning & production', /celebration venue/i],
  ])('maps %s without confusing education or adjacent topics', (briefText, business, scene) => {
    const topic = resolveVisualTopic(briefText)
    expect(topic?.business ?? null).toBe(business)
    if (scene) expect(topic?.subject).toMatch(scene)
  })

  it('keeps the exact text ban at the end of the generated music prompt', () => {
    const prompt = buildHeroImagePrompt(analyzeBrief('DJ Performans sitesi'))
    expect(prompt).toContain(FIXED_IMAGE_NEGATIVE_TERMS)
    expect(prompt.trim().endsWith(`${FIXED_IMAGE_NEGATIVE_TERMS}.`)).toBe(true)
  })
})

describe('low-confidence visual fallback', () => {
  it('uses a neutral abstract scene without the business name or generic office stock', () => {
    const brief = analyzeBrief('Kivu brand website with a thoughtful editorial identity')
    expect(brief.sector).toBe('default')
    expect(brief.confidence).toBe('low')
    expect(brief.visualNeed).toMatch(/abstract editorial composition/i)
    expect(brief.visualNeed).not.toContain('Kivu')

    const prompt = buildHeroImagePrompt(brief, 'Kivu thoughtful editorial identity', 'Kivu')
    expect(prompt).not.toContain('Kivu')
    expect(prompt).toMatch(/Do NOT depict:.*unrelated people/i)
    expect(prompt).not.toMatch(/professional workspace|people at work/i)
    expect(prompt.trim().endsWith(`${FIXED_IMAGE_NEGATIVE_TERMS}.`)).toBe(true)
  })
})

describe('image request cleanup', () => {
  it('strips builder boilerplate from a stored prompt', () => {
    const topic = resolveVisualTopic('kasap')!
    const stored = `${topic.subject}. Photorealistic hero banner photograph for a butcher shop. Do NOT depict: fruits. Style: modern. Wide cinematic composition with clear negative space, Not an empty landscape. STRICT RULE: no text.`
    expect(stripImagePromptBoilerplate(stored)).toBe(`${topic.subject}.`)
    expect(findGeneratedTopic(stored)?.business).toBe('butcher shop')
  })

  it('does not match short keys inside English words', () => {
    expect(describeVisualRequest('every street scene')).toBe('every street scene')
  })

  it('varies the composition cue', () => {
    expect(variationCue(() => 0)).not.toBe(variationCue(() => 0.99))
  })
})
