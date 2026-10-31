// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { SupportView } from '@/components/admin/support-view'
import { TicketDetailView } from '@/components/admin/ticket-detail-view'
import type { AdminTicket } from '@/lib/admin/queries'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/admin/actions', () => ({
  replyToTicket: vi.fn(),
  setTicketStatus: vi.fn(),
}))

function makeTicket(overrides: Partial<AdminTicket> = {}): AdminTicket {
  return {
    id: 'ticket-1',
    userId: 'user-1',
    userEmail: 'owner@gloval.ai',
    subject: 'Ads campaign question',
    ticketNumber: 'GLV-0001',
    department: 'gloval-ads',
    service: null,
    projectName: null,
    status: 'open',
    priority: 'normal',
    createdAt: '2026-02-01T12:00:00.000Z',
    updatedAt: '2026-02-01T12:00:00.000Z',
    messageCount: 1,
    ...overrides,
  }
}

function renderWithLanguage(lang: 'tr' | 'en', children: ReactNode) {
  return render(<LanguageProvider initialLang={lang}>{children}</LanguageProvider>)
}

afterEach(cleanup)

describe('admin support department filter and labels', () => {
  it('shows the localized label and filters tickets by department', () => {
    renderWithLanguage(
      'tr',
      <SupportView
        tickets={[
          makeTicket(),
          makeTicket({ id: 'ticket-2', subject: 'Billing question', department: 'billing' }),
        ]}
      />,
    )

    const departmentFilter = screen.getByRole('combobox', { name: 'Departman' }) as HTMLSelectElement
    expect(departmentFilter.value).toBe('all')
    expect(screen.getAllByText('GLOVAL Ads').length).toBeGreaterThan(0)

    fireEvent.change(departmentFilter, { target: { value: 'gloval-ads' } })

    expect(screen.getByText('Ads campaign question')).toBeTruthy()
    expect(screen.queryByText('Billing question')).toBeNull()
  })

  it('localizes the department in the ticket detail view', () => {
    renderWithLanguage('tr', <TicketDetailView ticket={makeTicket()} messages={[]} />)

    expect(screen.getByText('GLV-0001 · GLOVAL Ads')).toBeTruthy()
  })
})
