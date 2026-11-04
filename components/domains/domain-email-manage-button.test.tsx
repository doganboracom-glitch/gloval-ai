// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({
    t: {
      domains: {
        emailManage: 'Manage email',
        emailNeedsWebsite: 'Connect this domain to a GLOVAL site first.',
        emailExternalDnsHint: 'Add MX/SPF/DKIM at your external DNS provider when applicable.',
      },
    },
  }),
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <button type="button" disabled={disabled}>{children}</button>
  ),
}))
vi.mock('@/components/link-button', () => ({
  LinkButton: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { DomainEmailManageButton } from './domain-email-manage-button'

afterEach(() => cleanup())

describe('DomainEmailManageButton', () => {
  it('shows a disabled button and the binding requirement when access is unavailable', () => {
    render(<DomainEmailManageButton canManage={false} />)
    expect((screen.getByRole('button', { name: 'Manage email' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Connect this domain to a GLOVAL site first.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Manage email' })).toBeNull()
  })

  it('links to email management only when access is available', () => {
    render(<DomainEmailManageButton canManage />)
    expect(screen.getByRole('link', { name: 'Manage email' }).getAttribute('href')).toBe('/dashboard/email')
    expect(screen.queryByRole('button', { name: 'Manage email' })).toBeNull()
  })
})
