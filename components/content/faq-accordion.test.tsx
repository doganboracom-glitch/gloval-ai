// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FaqAccordion } from './faq-accordion'
import { getFaqItems } from '@/lib/content/faq'
import type { FaqItem } from '@/lib/content/types'

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: 'tr' }),
}))

function getItem(id: string): FaqItem {
  const item = getFaqItems().find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Missing FAQ item: ${id}`)
  return item
}

afterEach(cleanup)

describe('FAQ answer links', () => {
  it('links ownership and cancellation answers to their legal pages', () => {
    const { unmount: unmountOwnership } = render(<FaqAccordion items={[getItem('site-ownership')]} />)
    expect(screen.getByRole('link', { name: 'Kullanım Koşulları' }).getAttribute('href')).toBe(
      '/yasal/kullanim-kosullari',
    )
    unmountOwnership()

    render(<FaqAccordion items={[getItem('cancel-anytime')]} />)
    expect(screen.getByRole('link', { name: 'İptal ve İade' }).getAttribute('href')).toBe(
      '/yasal/iptal-ve-iade',
    )
  })

  it('uses the server-provided support path and defaults safely to the contact form', () => {
    const { unmount } = render(
      <FaqAccordion items={[getItem('ai-review')]} supportHref="/support/new" />,
    )
    expect(screen.getByRole('link', { name: 'DESTEK' }).getAttribute('href')).toBe('/support/new')
    unmount()

    render(<FaqAccordion items={[getItem('ai-review')]} />)
    expect(screen.getByRole('link', { name: 'DESTEK' }).getAttribute('href')).toBe('/iletisim')
  })
})
