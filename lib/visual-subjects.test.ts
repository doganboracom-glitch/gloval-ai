import { describe, expect, it } from 'vitest'
import { resolveVisualTopic } from './visual-subjects'
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
