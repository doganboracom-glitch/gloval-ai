import { describe, expect, it } from 'vitest'
import {
  aboutCardTitles,
  clampSentences,
  countSentences,
  groundText,
  hasAboutCopy,
  isGroundedSentence,
  preserveAboutCopy,
  readMoreLabel,
  resolveAboutCopy,
  splitSentences,
} from '@/lib/about-copy'
import { fallbackWebsite, type Section } from '@/lib/website-schema'

type About = Extract<Section, { type: 'about' }>

const FACTS = { allowed: 'Kahve atölyesi. Taze çekirdek kavurur, filtre kahve ve espresso sunarız.' }

describe('sentences', () => {
  it('splits on sentence ends but not inside numbers or domains', () => {
    expect(splitSentences('Kilo 3.5 kg olur. Adres www.site.com üzerinden bakın. 2008 yılı. Son cümle!')).toEqual([
      'Kilo 3.5 kg olur.',
      'Adres www.site.com üzerinden bakın.',
      '2008 yılı.',
      'Son cümle!',
    ])
  })

  it('clamps to the maximum and counts', () => {
    const text = 'Bir. Iki. Uc. Dort. Bes.'
    expect(clampSentences(text, 3)).toBe('Bir. Iki. Uc.')
    expect(countSentences(text)).toBe(5)
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('resolveAboutCopy', () => {
  it('is empty and keeps the legacy layout when no field is set', () => {
    const r = resolveAboutCopy({})
    expect(r).toEqual({ shortText: null, longText: null, vision: null, mission: null, detailLayout: false })
    expect(hasAboutCopy({})).toBe(false)
  })

  it('treats whitespace-only fields as empty', () => {
    expect(hasAboutCopy({ shortText: '  ', longText: '\n', vision: '', mission: ' ' })).toBe(false)
  })

  it('clamps the home teaser to 3 sentences', () => {
    const r = resolveAboutCopy({ shortText: 'A bir. B iki. C uc. D dort.' })
    expect(r.shortText).toBe('A bir. B iki. C uc.')
    expect(r.detailLayout).toBe(false)
  })

  it('switches the detail page layout when any long field exists', () => {
    expect(resolveAboutCopy({ vision: 'Vizyon metni.' }).detailLayout).toBe(true)
    expect(resolveAboutCopy({ longText: 'Uzun metin.' }).detailLayout).toBe(true)
    expect(resolveAboutCopy({ mission: 'Misyon metni.' }).detailLayout).toBe(true)
  })

  it('exposes localized labels', () => {
    expect(readMoreLabel('tr')).toBe('Devamını oku')
    expect(aboutCardTitles('tr')).toEqual({ vision: 'Vizyonumuz', mission: 'Misyonumuz' })
    expect(aboutCardTitles('en').mission).toBe('Our mission')
  })
})

describe('grounding guard', () => {
  it.each([
    ['2005 yılında kurulduk.'],
    ['500 müşteriye hizmet verdik.'],
    ['Ödüllü ekibimizle çalışırız.'],
    ['ISO sertifikalı üretim yaparız.'],
    ['Yıllardır sektörde hizmet veriyoruz.'],
    ['Binlerce mutlu müşterimiz var.'],
    ['We were founded to serve you.'],
    ['Our award-winning team helps you.'],
    ['Kurucumuz Ahmet Yılmaz bu işe başladı.'],
    ['Dr. Ayşe Demir ekibimizde yer alır.'],
    ['Lorem ipsum dolor sit amet.'],
    ['[Şirket adı] sizinle.'],
  ])('rejects: %s', (sentence) => {
    expect(isGroundedSentence(sentence, FACTS)).toBe(false)
  })

  it('accepts plain sentences that restate the brief', () => {
    expect(isGroundedSentence('Taze çekirdek kavurur, filtre kahve ve espresso sunarız.', FACTS)).toBe(true)
  })

  it('allows a number or a claim only when the owner stated it', () => {
    const owner = { allowed: '2005 yılında kurulduk. 12 çeşit kahve sunarız.' }
    expect(isGroundedSentence('12 çeşit kahve sunarız.', owner)).toBe(true)
    expect(isGroundedSentence('2005 yılında kurulduk.', owner)).toBe(true)
    expect(isGroundedSentence('2010 yılında büyüdük.', owner)).toBe(false)
  })

  it('drops bad sentences, keeps the rest and clamps', () => {
    const text = 'Taze kahve sunarız. 1998 yılında kurulduk. Espresso hazırlarız. Filtre kahve de var. Son cümle burada.'
    expect(groundText(text, FACTS, 3)).toBe('Taze kahve sunarız. Espresso hazırlarız. Filtre kahve de var.')
  })

  it('returns an empty string when nothing is safe', () => {
    expect(groundText('2001 yılında kurulduk. 300 müşterimiz var.', FACTS, 3)).toBe('')
  })
})

describe('preserveAboutCopy', () => {
  function site(copy?: Partial<About>) {
    const base = fallbackWebsite('kahve atölyesi', 'tr')
    return {
      ...base,
      sections: base.sections.map((s) => (s.type === 'about' ? ({ ...s, ...copy } as About) : s)),
    }
  }

  it('restores owner copy when an AI rewrite drops it', () => {
    const before = site({ shortText: 'Kısa.', vision: 'Vizyon.' })
    const after = preserveAboutCopy(before, site())
    const about = after.sections.find((s) => s.type === 'about') as About
    expect(about.shortText).toBe('Kısa.')
    expect(about.vision).toBe('Vizyon.')
  })

  it('does not overwrite copy the rewrite kept, and is a no-op when there was none', () => {
    const rewritten = site({ shortText: 'Yeni kısa.' })
    expect(preserveAboutCopy(site({ shortText: 'Eski.' }), rewritten)).toBe(rewritten)
    const plain = site()
    expect(preserveAboutCopy(site(), plain)).toBe(plain)
  })
})
