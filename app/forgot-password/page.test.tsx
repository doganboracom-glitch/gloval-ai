// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import ForgotPasswordPage from './page'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true } as Response)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('forgot password cooldown', () => {
  it('shows the shared 60-second countdown and disables repeat requests until it ends', async () => {
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText('E-posta'), {
      target: { value: 'member@example.test' },
    })

    const button = screen.getByRole('button', { name: 'Bağlantı gönder' })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain(
      'Bağlantı gönderildi. Gelmediyse spam klasörünü kontrol et; yeni bağlantıyı 60 sn sonra isteyebilirsin.',
    )
    expect(screen.getByRole('button', { name: 'Tekrar iste (60 sn)' }).hasAttribute('disabled')).toBe(
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar iste (60 sn)' }))
    expect(fetchMock).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(screen.getByRole('button', { name: 'Bağlantı gönder' }).hasAttribute('disabled')).toBe(
      false,
    )
    expect(screen.getByRole('status').textContent).toContain('artık yeni bağlantı isteyebilirsin.')
  })
})
