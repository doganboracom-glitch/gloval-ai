// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('@/components/auth/auth-shell', () => ({
  AuthShell: ({
    title,
    subtitle,
    children,
    footer,
  }: {
    title: string
    subtitle: string
    children: ReactNode
    footer: ReactNode
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
      <footer>{footer}</footer>
    </main>
  ),
}))
vi.mock('@/components/language-provider', async () => {
  const { dictionary } = await import('@/lib/i18n')
  return {
    useLanguage: () => ({ lang: 'tr', t: dictionary.tr }),
  }
})
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: authMocks.getSession,
      updateUser: authMocks.updateUser,
    },
  }),
}))

import ResetPasswordPage from './page'
import { dictionary } from '@/lib/i18n'

beforeEach(() => {
  vi.useFakeTimers()
  authMocks.getSession.mockReset().mockResolvedValue({
    data: { session: { access_token: 'recovery-token' } },
    error: null,
  })
  authMocks.updateUser.mockReset().mockResolvedValue({ error: null })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function submitPasswordUpdate(
  updateError: { code?: string; message?: string; status?: number } | null,
) {
  authMocks.updateUser.mockResolvedValue({ error: updateError })
  render(<ResetPasswordPage />)

  await act(async () => {
    await Promise.resolve()
  })

  fireEvent.change(screen.getByLabelText('Yeni şifre'), {
    target: { value: 'new-password-123' },
  })
  fireEvent.change(screen.getByLabelText('Yeni şifre tekrar'), {
    target: { value: 'new-password-123' },
  })

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Şifreyi güncelle' }))
    await Promise.resolve()
  })
}

describe('reset password update errors', () => {
  it.each([
    [
      'Supabase same_password code',
      { code: 'same_password', message: 'New password cannot be reused.' },
    ],
    [
      'Supabase message fallback',
      { message: 'New password must be different from the old password.' },
    ],
  ])('shows the current-password message for %s', async (_caseName, updateError) => {
    await submitPasswordUpdate(updateError)

    expect(screen.getByRole('alert').textContent).toBe(
      'Yeni şifre mevcut şifrenden farklı olmalı.',
    )
  })

  it('shows the existing recovery-link message for an expired token', async () => {
    await submitPasswordUpdate({ code: 'invalid_jwt', message: 'JWT expired', status: 401 })

    expect(screen.getByRole('alert').textContent).toBe(
      'Şifre güncellenemedi. Bağlantı geçersiz veya süresi dolmuş olabilir.',
    )
  })

  it('does not describe unrelated update errors as expired links', async () => {
    await submitPasswordUpdate({
      code: 'unexpected_failure',
      message: 'Unexpected service failure',
      status: 500,
    })

    expect(screen.getByRole('alert').textContent).toBe(
      'Şifre güncellenemedi. Lütfen tekrar deneyin.',
    )
  })

  it('keeps the success message after a successful update', async () => {
    await submitPasswordUpdate(null)

    expect(screen.getByRole('status').textContent).toBe(
      'Şifreniz başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsunuz.',
    )
    expect(authMocks.updateUser).toHaveBeenCalledWith({ password: 'new-password-123' })
  })

  it('provides translated messages for all requested locales', () => {
    const locales = ['tr', 'en', 'de', 'fr', 'es', 'it'] as const

    expect(dictionary.tr.auth.passwordSameAsCurrent).toBe(
      'Yeni şifre mevcut şifrenden farklı olmalı.',
    )
    for (const locale of locales) {
      expect(dictionary[locale].auth.passwordSameAsCurrent).toBeTruthy()
      expect(dictionary[locale].auth.passwordUpdateLinkError).toBeTruthy()
      expect(dictionary[locale].auth.passwordUpdateFailed).toBeTruthy()
    }
  })
})
