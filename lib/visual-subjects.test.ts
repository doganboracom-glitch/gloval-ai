import { describe, expect, it } from 'vitest'
import {
  describeVisualRequest,
  findGeneratedTopic,
  resolveVisualTopic,
  stripImagePromptBoilerplate,
  variationCue,
} from './visual-subjects'
import { analyzeBrief, buildHeroImagePrompt } from './hero-image'
import { deriveSeoTitle, detectSector } from './sector-profiles'

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
