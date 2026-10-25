// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ search: '' }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('@/components/language-provider', async () => {
  const { dictionary } = await import('@/lib/i18n')
  return { useLanguage: () => ({ t: dictionary.tr, lang: 'tr' }) }
})
vi.mock('@/components/auth/auth-shell', () => ({
  AuthShell: ({
    title,
    subtitle,
    children,
  }: {
    title: string
    subtitle: string
    children: ReactNode
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </main>
  ),
}))
vi.mock('@/components/link-button', () => ({
  LinkButton: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import AuthErrorPage from './page'

const DRAFT_TOKEN = 'd'.repeat(43)

beforeEach(() => {
  mocks.search = `draft=${DRAFT_TOKEN}`
})

afterEach(() => {
  cleanup()
})

describe('auth error fallback', () => {
  it('explains that the email may already be verified and carries the draft into login', () => {
    render(<AuthErrorPage />)

    expect(screen.getByText('E-postan doğrulanmış olabilir. Giriş yaparak devam et.')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Giriş yap' }).getAttribute('href')).toBe(
      `/auth/login?draft=${DRAFT_TOKEN}`,
    )
    expect(screen.queryByRole('link', { name: 'Yeni doğrulama e-postası gönder' })).toBeNull()
  })

  it('does not forward malformed draft values', () => {
    mocks.search = 'draft=invalid'
    render(<AuthErrorPage />)

    expect(screen.getByRole('link', { name: 'Giriş yap' }).getAttribute('href')).toBe('/auth/login')
  })
})
