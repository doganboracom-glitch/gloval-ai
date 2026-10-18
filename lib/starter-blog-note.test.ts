import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { PlanResult, type Plan } from '@/components/plan-result'
import { PLAN_BLOG_LINE, STARTER_NOTE_COPY, starterNoteStorageKey } from '@/lib/starter-blog-note'

const plan: Plan = {
  siteName: 'Aksoy Diş Kliniği',
  tagline: 'Gülüşünüz için',
  tone: 'Sakin',
  audience: 'Aileler',
  palette: [{ name: 'Mavi', hex: '#2563eb' }],
  pages: ['Anasayfa'],
  sections: [{ title: 'Hero', description: 'Karşılama' }],
}

function render(lang: 'tr' | 'en') {
  return renderToStaticMarkup(
    createElement(LanguageProvider, { initialLang: lang, children: createElement(PlanResult, { plan }) }),
  )
}

describe('starter blog copy', () => {
  it.each(['tr', 'en'] as const)('plan card shows the blog line once (%s)', (lang) => {
    const html = render(lang)
    expect(html).toContain(PLAN_BLOG_LINE[lang])
    expect(html.split('data-testid="plan-blog-line"')).toHaveLength(2)
  })

  it('the editor note explains live-now and noindex in both languages', () => {
    expect(STARTER_NOTE_COPY.tr.body).toMatch(/hemen yayında/)
    expect(STARTER_NOTE_COPY.en.body).toMatch(/go live right away/)
  })

  it('the note is dismissed once per project', () => {
    expect(starterNoteStorageKey('a')).not.toBe(starterNoteStorageKey('b'))
  })
})
