// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmailConfirmationPrompt } from './prompt'

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({
    t: {
      auth: {
        verifyTitle: 'E-posta Adresinizi Doğrulayın',
        verifyBody: 'GLOVAL AI hesabınızı doğrulamak için e-postanızı onaylayın.',
        confirmEmail: 'E-postamı doğrula',
        confirmLinkMissing: 'Bu doğrulama bağlantısı eksik veya geçersiz.',
        sendNewLink: 'Yeni doğrulama e-postası gönder',
      },
    },
  }),
}))

vi.mock('@/components/auth/auth-shell', () => ({
  AuthShell: ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </main>
  ),
}))

afterEach(cleanup)

describe('EmailConfirmationPrompt', () => {
  it('requires a deliberate POST click and keeps a resend option visible', () => {
    render(
      <EmailConfirmationPrompt
        tokenHash="opaque-token-hash"
        type="signup"
        draft={null}
        next="/dashboard"
      />,
    )

    const button = screen.getByRole('button', { name: 'E-postamı doğrula' })
    const form = button.closest('form')
    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe('/auth/confirm/verify')
    expect(form?.querySelector('input[name="token_hash"]')?.getAttribute('value')).toBe(
      'opaque-token-hash',
    )
    expect(
      screen.getByRole('link', { name: 'Yeni doğrulama e-postası gönder' }).getAttribute('href'),
    ).toBe('/auth/verify-email')
  })

  it('offers a resend path on a parameterless visit but never auto-verifies', () => {
    render(
      <EmailConfirmationPrompt tokenHash={null} type={null} draft={null} next="/dashboard" />,
    )

    expect(screen.queryByRole('button', { name: 'E-postamı doğrula' })).toBeNull()
    expect(screen.getByText('Bu doğrulama bağlantısı eksik veya geçersiz.')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Yeni doğrulama e-postası gönder' })).not.toBeNull()
  })
})
