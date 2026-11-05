// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddOnAllowanceCard } from '@/components/billing/add-on-allowance-card'
import { CollapsibleAddOnsSection } from '@/components/billing/collapsible-add-ons-section'
import { useAddonDeepLink } from '@/components/billing/use-addon-deep-link'
import { addonCardId } from '@/lib/billing-addon-focus'
import type { AddOnCatalogItem } from '@/lib/add-ons'

const scrollIntoView = vi.fn()
let prefersReducedMotion = false
const mailItems: AddOnCatalogItem[] = [
  {
    code: 'extra_mail_1',
    kind: 'mail',
    capacity: 1,
    priceCents: 4900,
    currency: 'TRY',
    period: 'month',
    eligible: true,
  },
  {
    code: 'extra_mail_1_yearly',
    kind: 'mail',
    capacity: 1,
    priceCents: 49000,
    currency: 'TRY',
    period: 'year',
    eligible: true,
  },
  {
    code: 'extra_mail_5',
    kind: 'mail',
    capacity: 5,
    priceCents: 19900,
    currency: 'TRY',
    period: 'month',
    eligible: true,
  },
  {
    code: 'extra_mail_5_yearly',
    kind: 'mail',
    capacity: 5,
    priceCents: 199000,
    currency: 'TRY',
    period: 'year',
    eligible: true,
  },
]

function DeepLinkHarness() {
  const highlightedCode = useAddonDeepLink()

  return (
    <CollapsibleAddOnsSection title="Diğer Ek Paketler" summary="3 paket">
      <AddOnAllowanceCard
        kind="mail"
        items={mailItems}
        defaultPeriod="month"
        title="GLOVAL Mail"
        description="Ek posta kutusu kapasitesi"
        yearlyDescription="12 ay geçerlidir, otomatik yenilenmez ve bir kez tahsil edilir."
        selectLabel="Paket"
        optionLabel="{item} - {amount} {currency} {period}"
        currencyLabel="TL"
        unavailableOptionLabel="Mevcut pakette kullanılamaz"
        availabilityHint="Bazı seçenekler kullanılamıyor"
        unitLabelFor={(item) => `${item.capacity} posta kutusu`}
        notEligible="Bu paket için uygun değil"
        notEligibleBadge="Uygun değil"
        periodLabels={{ month: '/ Ay', year: '/ Yıl' }}
        yearlyBadge="2 ay ücretsiz"
        periodNotes={{ month: 'Aylık paket', year: 'Yıllık paket' }}
        vatIncluded="KDV dahil"
        buyLabel="Satın al"
        buySelectedAriaLabel="{item} satın al"
        buyingLabel="Satın alınıyor"
        onBuy={vi.fn()}
        busyCode={null}
        purchaseLocked={false}
        highlightedCode={highlightedCode}
      />
    </CollapsibleAddOnsSection>
  )
}

function MissingCardHarness() {
  const highlightedCode = useAddonDeepLink()

  return (
    <>
      <output data-testid="highlighted-code">{highlightedCode ?? 'none'}</output>
      <CollapsibleAddOnsSection title="Diğer Ek Paketler" summary="3 paket">
        No card matches this link
      </CollapsibleAddOnsSection>
    </>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  prefersReducedMotion = false
  Element.prototype.scrollIntoView = scrollIntoView
  window.matchMedia = ((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && prefersReducedMotion,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0)
    return 0
  }) as typeof window.requestAnimationFrame
  window.history.replaceState(null, '', '/billing?addon=extra_mail_5_yearly')
})

afterEach(() => {
  cleanup()
  scrollIntoView.mockClear()
  vi.useRealTimers()
})

describe('add-on allowance deep link', () => {
  it('opens the section, focuses the target card, and preselects the linked yearly offer', async () => {
    render(<DeepLinkHarness />)

    const toggle = screen.getByRole('button', { name: /Diğer Ek Paketler/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })

    const select = screen.getByLabelText('Paket') as HTMLSelectElement
    expect(select.value).toBe('extra_mail_5_yearly')
    expect(
      Array.from(select.options).find((option) => option.value === 'extra_mail_5_yearly')?.textContent,
    ).toBe('5 posta kutusu - 1.990 TL / Yıl')
    expect(screen.getByText('2 ay ücretsiz')).toBeTruthy()
    expect(screen.getByText('12 ay geçerlidir, otomatik yenilenmez ve bir kez tahsil edilir.')).toBeTruthy()
    expect(document.getElementById(addonCardId('extra_mail_5_yearly'))).toBeTruthy()
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })

  it('uses immediate, non-smooth scrolling when reduced motion is preferred', async () => {
    prefersReducedMotion = true
    render(<DeepLinkHarness />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
  })

  it('does not scroll or leave a highlight when the linked card is missing', async () => {
    render(<MissingCardHarness />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })

    expect(screen.getByTestId('highlighted-code').textContent).toBe('none')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('does not open, highlight, or scroll without an add-on query parameter', async () => {
    window.history.replaceState(null, '', '/billing?campaign=plans')
    render(<DeepLinkHarness />)

    expect(screen.getByRole('button', { name: /Diğer Ek Paketler/ }).getAttribute('aria-expanded')).toBe('false')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
