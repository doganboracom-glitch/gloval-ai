// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { SupportView } from '@/components/admin/support-view'
import { TicketDetailView } from '@/components/admin/ticket-detail-view'
import type { AdminTicket } from '@/lib/admin/queries'
import type { TicketDepartment } from '@/lib/support/constants'
import { LANG_COOKIE } from '@/lib/i18n'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/lib/admin/actions', () => ({ replyToTicket: vi.fn(), setTicketStatus: vi.fn() }))

function renderWithLanguage(lang: 'tr' | 'en', children: ReactNode) {
  return render(<LanguageProvider initialLang={lang}>{children}</LanguageProvider>)
}

function ticket(id: string, subject: string, department: TicketDepartment): AdminTicket {
  return {
    id,
    userId: `user-${id}`,
    userEmail: 'owner@gloval.ai',
    subject,
    ticketNumber: `GLV-${id}`,
    department,
    service: null,
    projectName: null,
    status: 'open',
    priority: 'normal',
    createdAt: '2026-10-31T10:00:00.000Z',
    updatedAt: '2026-10-31T10:00:00.000Z',
    messageCount: 1,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0; samesite=lax`
})

afterEach(cleanup)

describe('admin support departments', () => {
  it('filters support tickets by department', () => {
    renderWithLanguage(
      'tr',
      <SupportView tickets={[ticket('1', 'Ads ticket', 'gloval-ads'), ticket('2', 'Billing ticket', 'billing')]} />,
    )

    const departmentFilter = screen.getByRole('combobox', { name: 'Departman' })
    fireEvent.change(departmentFilter, { target: { value: 'gloval-ads' } })

    expect(screen.getByRole('link', { name: 'Ads ticket' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Billing ticket' })).toBeNull()
  })

  it('shows the localized department label on the ticket detail page', () => {
    renderWithLanguage('tr', <TicketDetailView ticket={ticket('1', 'Ads ticket', 'gloval-ads')} messages={[]} />)

    expect(screen.getByText(/GLV-1 · GLOVAL Ads/)).toBeTruthy()
  })
})
