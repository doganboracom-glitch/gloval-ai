// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BotPageClient } from '@/components/bot/bot-page-client'
import { LanguageProvider } from '@/components/language-provider'
import { LANG_COOKIE } from '@/lib/i18n'
import { SCAN_BOT_INFO_URL, SCAN_USER_AGENT } from '@/lib/ads/scan/config'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/site-footer', () => ({ SiteFooter: () => null }))

function renderPage(lang: 'tr' | 'en') {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/`
  return render(
    <LanguageProvider>
      <BotPageClient supportEmail="support@gloval.ai" />
    </LanguageProvider>,
  )
}

afterEach(() => {
  cleanup()
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0`
})

describe('BotPageClient', () => {
  it('links to a page that matches the URL advertised in the user agent', () => {
    expect(new URL(SCAN_BOT_INFO_URL).pathname).toBe('/bot')
  })

  it('shows the user agent, robots.txt examples and the support email in Turkish', () => {
    renderPage('tr')

    expect(screen.getByRole('heading', { level: 1, name: 'GlovalAdsBot' })).toBeTruthy()
    expect(screen.getByText(SCAN_USER_AGENT)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Ne okur?' })).toBeTruthy()
    expect(document.body.textContent).toContain('User-agent: GlovalAdsBot')
    expect(document.body.textContent).toContain('Disallow: /')
    expect(document.body.textContent).toContain('Allow: /')
    expect(document.body.textContent).toContain('korumaları aşmaya çalışmayız')
    expect(screen.getByRole('link', { name: 'support@gloval.ai' }).getAttribute('href')).toBe(
      'mailto:support@gloval.ai',
    )
  })

  it('renders in English', () => {
    renderPage('en')

    expect(screen.getByRole('heading', { name: 'What does it read?' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How to block or allow it' })).toBeTruthy()
    expect(document.body.textContent).toContain('do not try to bypass it')
  })
})
