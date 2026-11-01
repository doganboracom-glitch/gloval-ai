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
        recoveryConfirmTitle: 'Şifre sıfırlama bağlantısını doğrula',
        recoveryConfirmBody: 'Devam ederek şifre belirleme sayfasına geç.',
        confirmRecovery: 'Yeni şifre belirlemeye devam et',
        recoveryErrorTitle: 'Şifre sıfırlama bağlantısı açılamadı',
        recoveryLinkInvalid:
          'Şifre sıfırlama bağlantısı geçersiz, süresi dolmuş veya kullanılmış olabilir.',
        requestNewRecoveryLink: 'Yeni bağlantı iste',
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

  it('renders recovery confirmation as a deliberate POST with no caller-controlled redirect fields', () => {
    render(
      <EmailConfirmationPrompt
        tokenHash="opaque-recovery-token"
        type="recovery"
        draft={"a".repeat(43)}
        next="https://attacker.example"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Şifre sıfırlama bağlantısını doğrula' })).not.toBeNull()
    const button = screen.getByRole('button', { name: 'Yeni şifre belirlemeye devam et' })
    const form = button.closest('form')
    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe('/auth/confirm/verify')
    expect(form?.querySelector('input[name="type"]')?.getAttribute('value')).toBe('recovery')
    expect(form?.querySelector('input[name="next"]')).toBeNull()
    expect(form?.querySelector('input[name="draft"]')).toBeNull()
    expect(screen.getByRole('link', { name: 'Yeni bağlantı iste' }).getAttribute('href')).toBe(
      '/forgot-password',
    )
  })

  it('shows a recovery-specific expired state and never auto-verifies', () => {
    render(<EmailConfirmationPrompt tokenHash={null} type="recovery" draft={null} next="/auth/reset-password" />)

    expect(screen.getByRole('heading', { name: 'Şifre sıfırlama bağlantısı açılamadı' })).not.toBeNull()
    expect(
      screen.getByText('Şifre sıfırlama bağlantısı geçersiz, süresi dolmuş veya kullanılmış olabilir.'),
    ).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Yeni şifre belirlemeye devam et' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Yeni bağlantı iste' }).getAttribute('href')).toBe(
      '/forgot-password',
    )
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
