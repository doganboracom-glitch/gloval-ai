// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SAMPLE_PUBLISH_COPY } from '@/components/editor/sample-publish-dialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('sample publish dialog section names', () => {
  const TYPES = [
    'services', 'testimonials', 'references', 'team', 'about', 'faq', 'stats', 'pricing',
    'products', 'contact', 'features', 'gallery', 'portfolio', 'categories', 'process',
    'announcement', 'heroStrip', 'slider', 'blogLatest', 'cta',
  ]

  it('has a human-readable name for every section type in both languages', () => {
    for (const lang of ['tr', 'en'] as const) {
      const names = SAMPLE_PUBLISH_COPY[lang].sections as Record<string, string>
      for (const type of TYPES) {
        expect(names[type], `${lang}:${type}`).toBeTruthy()
        expect(names[type]).not.toBe(type)
      }
    }
  })

  it('uses the requested Turkish names', () => {
    const tr = SAMPLE_PUBLISH_COPY.tr.sections as Record<string, string>
    expect(tr).toMatchObject({
      services: 'Hizmetler',
      testimonials: 'Müşteri yorumları',
      references: 'Referanslar',
      team: 'Kadromuz',
    })
  })
})
