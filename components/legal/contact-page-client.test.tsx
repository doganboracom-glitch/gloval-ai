// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactPageClient } from '@/components/legal/contact-page-client'
import { LanguageProvider } from '@/components/language-provider'
import { CONSENT_CHANGE_EVENT } from '@/lib/cookie-consent-storage'
import { LANG_COOKIE } from '@/lib/i18n'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/site-footer', () => ({ SiteFooter: () => null }))
vi.mock('@/lib/support/contact', () => ({ submitContactRequest: vi.fn() }))

beforeEach(() => {
  window.localStorage.clear()
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0; samesite=lax`
})

afterEach(cleanup)

describe('ContactPageClient message prefill', () => {
  it('focuses the prefilled message at the end and preserves text entered by the visitor', () => {
    const initialMessage = 'Web sitesi yaptırmak istiyorum. Telefonum: '
    const view = render(
      <LanguageProvider initialLang="tr">
        <ContactPageClient initialMessage={initialMessage} />
      </LanguageProvider>,
    )

    const messageField = screen.getByLabelText('Mesajınız') as HTMLTextAreaElement
    expect(messageField.value).toBe(initialMessage)
    expect(document.activeElement).toBe(messageField)
    expect(messageField.selectionStart).toBe(initialMessage.length)
    expect(messageField.selectionEnd).toBe(initialMessage.length)

    const enteredMessage = `${initialMessage}+90 555 123 4567`
    fireEvent.change(messageField, { target: { value: enteredMessage } })
    view.rerender(
      <LanguageProvider initialLang="tr">
        <ContactPageClient initialMessage="A later query must not replace this text" />
      </LanguageProvider>,
    )

    expect((screen.getByLabelText('Mesajınız') as HTMLTextAreaElement).value).toBe(
      enteredMessage,
    )
  })

  it('restores focus after cookie consent changes in Strict Mode', async () => {
    const initialMessage = 'Web sitesi yaptırmak istiyorum. Telefonum: '

    render(
      <StrictMode>
        <LanguageProvider initialLang="tr">
          <ContactPageClient initialMessage={initialMessage} />
        </LanguageProvider>
      </StrictMode>,
    )

    const messageField = screen.getByLabelText('Mesajınız') as HTMLTextAreaElement
    const nameField = screen.getByLabelText('Ad Soyad')
    await waitFor(() => expect(document.activeElement).toBe(messageField))

    nameField.focus()
    expect(document.activeElement).toBe(nameField)
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT))

    await waitFor(() => {
      expect(document.activeElement).toBe(messageField)
      expect(messageField.selectionStart).toBe(initialMessage.length)
      expect(messageField.selectionEnd).toBe(initialMessage.length)
    })
  })
})
