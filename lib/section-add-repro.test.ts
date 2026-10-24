import { it } from 'vitest'
import { guardEdit } from './edit-guard'
import { ADDABLE_SECTION_TYPES, applyOperation } from './website-edit-operations'
import { countCappedSections, websiteSchema, type WebsiteSchema } from './website-schema'

function site(): WebsiteSchema {
  return {
    meta: { name: 'DB Ajans', language: 'tr' },
    navigation: { logoText: 'DB Ajans', links: [] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections: [
      { type: 'hero', title: 'DB Ajans', description: 'Reklam ve tanıtım' },
      { type: 'about', title: 'Hakkımızda', body: 'Metin' },
      { type: 'services', title: 'Hizmetler', items: [{ title: 'a', description: 'b', icon: 'star' }] },
      { type: 'stats', title: 'Rakamlar', items: [{ value: '1', label: 'x', icon: 'users' }] },
      { type: 'gallery', title: 'Galeri', items: [{ imagePrompt: 'x' }] },
      { type: 'testimonials', title: 'Yorumlar', items: [{ quote: 'q', author: 'a' }] },
      { type: 'references', title: 'Referanslar', items: [{ name: 'x' }] },
      { type: 'blogLatest' },
      { type: 'faq', title: 'SSS', items: [{ question: 'Q', answer: 'A' }] },
      { type: 'cta', title: 'CTA', description: 'x', primaryButton: { label: 'a', href: '#' } },
      { type: 'contact', title: 'İletişim', description: 'x', fields: ['Ad'] },
      { type: 'footer' },
    ],
  } as unknown as WebsiteSchema
}

it('repro', () => {
  const live = site()
  console.log('REPRO capped count', countCappedSections(live.sections), 'valid', websiteSchema.safeParse(live).success)
  for (const type of ADDABLE_SECTION_TYPES) {
    const next = applyOperation(live, { op: 'addSection', sectionType: type })
    const verdict = guardEdit(live, next)
    console.log('REPRO', type, verdict.ok ? 'OK' : JSON.stringify(verdict.issues))
  }
})
