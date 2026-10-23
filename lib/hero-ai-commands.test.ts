import { describe, expect, it } from 'vitest'
import { parseCommand } from '@/lib/website-command-parser'
import { applyOperation, type EditOperation } from '@/lib/website-edit-operations'
import { guardEdit } from '@/lib/edit-guard'
import { buildSampleSite } from '@/lib/__fixtures__/sample-site'
import type { WebsiteSchema } from '@/lib/website-schema'

function heroOf(site: WebsiteSchema) {
  const hero = site.sections.find((s) => s.type === 'hero')
  if (!hero || hero.type !== 'hero') throw new Error('no hero')
  return hero
}

function siteWith(hero: Record<string, unknown>, language: 'tr' | 'en' = 'tr'): WebsiteSchema {
  const site = buildSampleSite()
  site.meta.language = language
  Object.assign(heroOf(site), hero)
  return site
}

/** Parse, apply every returned op, and run the same guard the editor runs. */
function run(instruction: string, site: WebsiteSchema) {
  const parsed = parseCommand(instruction, site)
  let next = site
  for (const op of parsed?.operations ?? []) next = applyOperation(next, op)
  return { parsed, next, guard: guardEdit(site, next) }
}

describe('AI edit commands drive updateHeroLayout', () => {
  it('"hero tarzını tam ekran yap" switches the layout', () => {
    const { parsed, next, guard } = run('hero tarzını tam ekran yap', siteWith({}))
    expect(parsed?.operations).toEqual([{ op: 'updateHeroLayout', patch: { layout: 'full-bleed' } }])
    expect(heroOf(next).layout).toBe('full-bleed')
    expect(guard.ok).toBe(true)
  })

  it('maps light-cover and standard phrases', () => {
    const light = run('hero tarzını açık yan görsel yap', siteWith({ layout: 'full-bleed' }))
    expect(heroOf(light.next).layout).toBe('light-cover')
    const std = run('hero tarzını standart yap', siteWith({ layout: 'full-bleed', align: 'center' }))
    expect(heroOf(std.next).layout).toBe('split')
    expect(heroOf(std.next).align).not.toBe('center')
  })

  it('"yazıyı ortala" centers copy on a full-bleed hero', () => {
    const { parsed, next, guard } = run('yazıyı ortala', siteWith({ layout: 'full-bleed', align: 'left' }))
    expect(parsed?.operations).toEqual([{ op: 'updateHeroLayout', patch: { align: 'center' } }])
    expect(heroOf(next).align).toBe('center')
    expect(guard.ok).toBe(true)
  })

  it('refuses to center on a non-full-bleed hero (constraint) and says why', () => {
    const site = siteWith({ layout: 'light-cover' })
    const { parsed, next } = run('yazıyı ortala', site)
    expect(parsed?.operations).toEqual([])
    expect(parsed?.feedback).toMatch(/tam ekran/)
    expect(next).toBe(site)
    expect(heroOf(next).align).toBeUndefined()
  })

  it('refuses to center on the legacy (unset) hero too', () => {
    const { parsed } = run('yazıyı ortala', siteWith({}))
    expect(parsed?.operations).toEqual([])
  })

  it('combines layout + center in one operation, so centering is valid in the same step', () => {
    const { parsed, next, guard } = run('hero tarzını tam ekran yap ve yazıyı ortala', siteWith({}))
    expect(parsed?.operations).toEqual([{ op: 'updateHeroLayout', patch: { layout: 'full-bleed', align: 'center' } }])
    expect(heroOf(next)).toMatchObject({ layout: 'full-bleed', align: 'center' })
    expect(guard.ok).toBe(true)
  })

  it('"karartmayı artır / azalt / kaldır" moves the overlay in steps, clamped to 0..70', () => {
    const base = siteWith({ layout: 'full-bleed', overlay: 40 })
    expect(heroOf(run('karartmayı artır', base).next).overlay).toBe(50)
    expect(heroOf(run('karartmayı azalt', base).next).overlay).toBe(30)
    expect(heroOf(run('karartmayı kaldır', base).next).overlay).toBe(0)
    expect(heroOf(run('karartmayı %55 yap', base).next).overlay).toBe(55)
    expect(heroOf(run('karartmayı artır', siteWith({ layout: 'full-bleed', overlay: 70 })).next).overlay).toBe(70)
    expect(heroOf(run('karartmayı azalt', siteWith({ layout: 'full-bleed', overlay: 0 })).next).overlay).toBe(0)
    expect(heroOf(run('karartmayı %300 yap', base).next).overlay).toBe(70)
  })

  it('overlay uses the default (40) when none was stored', () => {
    expect(heroOf(run('karartmayı artır', siteWith({ layout: 'full-bleed' })).next).overlay).toBe(50)
  })

  it('overlay is refused outside full-bleed instead of silently doing nothing', () => {
    const { parsed } = run('karartmayı artır', siteWith({ layout: 'light-cover' }))
    expect(parsed?.operations).toEqual([])
    expect(parsed?.feedback).toMatch(/tam ekran/)
  })

  it('works in English', () => {
    const site = siteWith({ layout: 'split' }, 'en')
    expect(heroOf(run('make the hero style full screen', site).next).layout).toBe('full-bleed')
    const full = siteWith({ layout: 'full-bleed', overlay: 40 }, 'en')
    expect(heroOf(run('center the text', full).next).align).toBe('center')
    expect(heroOf(run('increase the overlay', full).next).overlay).toBe(50)
  })

  it('every produced operation is a plain updateHeroLayout (no other op leaks in)', () => {
    const phrases = ['hero tarzını tam ekran yap', 'yazıyı ortala', 'karartmayı artır']
    for (const phrase of phrases) {
      const ops: EditOperation[] = parseCommand(phrase, siteWith({ layout: 'full-bleed' }))?.operations ?? []
      expect(ops.every((op) => op.op === 'updateHeroLayout')).toBe(true)
    }
  })

  it('does not hijack unrelated commands', () => {
    const site = siteWith({ layout: 'full-bleed' })
    for (const phrase of ['logoyu ortala', 'menüyü ortala', 'footer yazısını ortala', 'SEO başlığını değiştir']) {
      const ops = parseCommand(phrase, site)?.operations ?? []
      expect(ops.some((op) => op.op === 'updateHeroLayout')).toBe(false)
    }
  })

  it('reports a missing hero instead of failing', () => {
    const site = buildSampleSite()
    site.sections = site.sections.filter((s) => s.type !== 'hero')
    const parsed = parseCommand('hero tarzını tam ekran yap', site)
    expect(parsed?.operations).toEqual([])
    expect(parsed?.feedback).toBeTruthy()
  })
})

describe('changing the hero style never loses slide content', () => {
  const slides = [
    { title: 'Bir', description: 'a', image: { imagePrompt: 'p1', src: '/1.webp', alt: 'bir', aspectRatio: '16/9' as const } },
    { title: 'İki', description: 'b', image: { imagePrompt: 'p2', src: '/2.webp', alt: 'iki', aspectRatio: '16/9' as const } },
    { title: 'Üç', description: 'c', image: { imagePrompt: 'p3', src: '/3.webp', alt: 'üç', aspectRatio: '16/9' as const } },
  ]

  it('keeps every slide, image, alt and order across all style switches and AI commands', () => {
    let site = siteWith({ variant: 'slider', slides, title: 'Ana başlık' })
    const before = JSON.stringify(heroOf(site).slides)
    const steps = ['hero tarzını tam ekran yap', 'yazıyı ortala', 'karartmayı artır', 'hero tarzını açık yan görsel yap', 'hero tarzını standart yap']
    for (const step of steps) {
      site = run(step, site).next
      expect(JSON.stringify(heroOf(site).slides)).toBe(before)
      expect(heroOf(site).title).toBe('Ana başlık')
    }
    for (const layout of ['full-bleed', 'light-cover', 'split'] as const) {
      site = applyOperation(site, { op: 'updateHeroLayout', patch: { layout } })
      expect(JSON.stringify(heroOf(site).slides)).toBe(before)
    }
  })
})
