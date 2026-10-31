// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { NewTicketForm } from '@/components/support/new-ticket-form'
import { parseTicketPrefill } from '@/lib/support/prefill'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/support/actions', () => ({ createSupportTicket: vi.fn() }))

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => 'test-idempotency-key' })
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('NewTicketForm department', () => {
  it('shows GLOVAL Ads and selects it from a validated prefill', () => {
    render(
      <LanguageProvider initialLang="tr">
        <NewTicketForm projects={[]} prefill={parseTicketPrefill({ department: 'gloval-ads' }, [])} />
      </LanguageProvider>,
    )

    const department = screen.getByRole('combobox', { name: /Departman/ }) as HTMLSelectElement
    expect(department.value).toBe('gloval-ads')
    expect(screen.getByRole('option', { name: 'GLOVAL Ads' })).toBeTruthy()
  })
})
