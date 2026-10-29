// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingProfileBanner } from './billing-profile-banner'
import { BillingProfileCard } from './billing-profile-card'
import { BILLING_PROFILE_HREF } from '@/lib/billing-profile-link'
import type { BillingProfileSummary } from '@/lib/billing-profile-types'

vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: 'tr' }) }))
vi.mock('@/lib/billing-profile-actions', () => ({ saveBillingProfileAction: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const completeProfile = {
  complete: true,
  customerType: 'individual',
  fullName: 'Ada Lovelace',
  companyTitle: '',
  taxOffice: '',
  addressLine: 'Bir Sok. 1',
  district: 'Kadıköy',
  city: 'İstanbul',
  postalCode: '',
  phone: '+905321112233',
  invoiceEmail: 'ada@example.com',
  eInvoicePayer: false,
  hasNationalId: true,
  hasTaxNumber: false,
  nationalIdLast3: '123',
  taxNumberLast3: null,
} as unknown as BillingProfileSummary

const baseProps = { storageAvailable: true, defaultFullName: 'Ada', defaultEmail: 'ada@example.com' }

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => cleanup())

describe('BillingProfileCard for users without a paid plan', () => {
  it('shows the #fatura-bilgileri section with an enter CTA when the profile is missing', () => {
    const { container } = render(<BillingProfileCard {...baseProps} initialProfile={null} />)
    expect(container.querySelector('section#fatura-bilgileri')).not.toBeNull()
    expect(screen.getByTestId('billing-profile-incomplete')).toBeTruthy()
    expect(screen.getByText('Henüz fatura bilgisi eklenmedi.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fatura bilgilerini gir' })).toBeTruthy()
  })

  it('opens the form from the CTA', () => {
    render(<BillingProfileCard {...baseProps} initialProfile={null} />)
    const panel = document.getElementById('billing-profile-panel') as HTMLElement
    expect(panel.hidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Fatura bilgilerini gir' }))
    expect(panel.hidden).toBe(false)
  })

  it('shows the completed summary instead of the CTA once the profile is complete', () => {
    render(<BillingProfileCard {...baseProps} initialProfile={completeProfile} />)
    expect(screen.queryByTestId('billing-profile-incomplete')).toBeNull()
    expect(screen.getByText('Bilgiler tamamlandı')).toBeTruthy()
  })

  it('keeps the section anchor when storage is unavailable', () => {
    const { container } = render(<BillingProfileCard {...baseProps} storageAvailable={false} initialProfile={null} />)
    expect(container.querySelector('section#fatura-bilgileri')).not.toBeNull()
  })
})

describe('BillingProfileBanner (paid-subscriber warning regression)', () => {
  it('still renders the warning when shown', () => {
    render(<BillingProfileBanner show onEnter={() => {}} />)
    expect(screen.getByText('Fatura bilgileriniz eksik')).toBeTruthy()
  })

  it('renders nothing when hidden', () => {
    const { container } = render(<BillingProfileBanner show={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('links outside /billing to the profile section', () => {
    render(<BillingProfileBanner show />)
    expect(screen.getByRole('link').getAttribute('href')).toBe(BILLING_PROFILE_HREF)
  })
})

describe('BILLING_PROFILE_HREF', () => {
  it('opens the form and targets #fatura-bilgileri', () => {
    expect(BILLING_PROFILE_HREF).toBe('/billing?fatura=1#fatura-bilgileri')
  })
})
