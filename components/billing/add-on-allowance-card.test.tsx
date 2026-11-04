// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AddOnCatalogItem } from '@/lib/add-ons'
import { formatMoney } from '@/lib/billing-utils'
import { AddOnAllowanceCard } from './add-on-allowance-card'

afterEach(cleanup)

const websiteItems: AddOnCatalogItem[] = [
  {
    code: 'extra_corporate_site_1',
    kind: 'site',
    siteTarget: 'corporate',
    capacity: 1,
    priceCents: 19900,
    currency: 'TRY',
    period: 'month',
    eligible: true,
  },
  {
    code: 'extra_ecommerce_site_1',
    kind: 'site',
    siteTarget: 'ecommerce',
    capacity: 1,
    priceCents: 49900,
    currency: 'TRY',
    period: 'month',
    eligible: true,
  },
]

const emailItems: AddOnCatalogItem[] = [
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
    code: 'extra_mail_5',
    kind: 'mail',
    capacity: 5,
    priceCents: 19900,
    currency: 'TRY',
    period: 'month',
    eligible: true,
  },
]

function renderAllowanceCard({
  items = websiteItems,
  kind = 'site',
  selectLabel = 'Website allowance',
  unitLabelFor = (item) =>
    item.siteTarget === 'ecommerce' ? '+1 e-commerce site' : '+1 corporate site',
  onBuy = vi.fn(),
  defaultPeriod = 'month',
}: {
  items?: AddOnCatalogItem[]
  kind?: 'site' | 'mail'
  selectLabel?: string
  unitLabelFor?: (item: AddOnCatalogItem) => string
  onBuy?: (code: AddOnCatalogItem['code']) => void
  defaultPeriod?: 'month' | 'year'
} = {}) {
  render(
    <AddOnAllowanceCard
      kind={kind}
      items={items}
      title="Allowance"
      description="Select a capacity."
      selectLabel={selectLabel}
      optionLabel="{item} - {amount} {currency} {period}"
      currencyLabel="TL"
      unitLabelFor={unitLabelFor}
      unavailableOptionLabel="Unavailable on your plan"
      availabilityHint="Some offers require a different plan."
      notEligible="An active plan is required."
      notEligibleBadge="Not available"
      defaultPeriod={defaultPeriod}
      periodLabels={{ month: '/ mo', year: '/ yr' }}
      yearlyBadge="2 months free"
      periodNotes={{ month: 'Valid for your current billing period.', year: 'Valid for 12 months.' }}
      vatIncluded="VAT included"
      buyLabel="Buy selected"
      buySelectedAriaLabel="Buy {item} for {price} {period}"
      buyingLabel="Processing"
      onBuy={onBuy}
      busyCode={null}
      purchaseLocked={false}
    />,
  )
  return { onBuy }
}

describe('AddOnAllowanceCard', () => {
  it('updates the selected website price and buys the selected SKU', () => {
    const { onBuy } = renderAllowanceCard({ items: websiteItems })
    const select = screen.getByLabelText('Website allowance')

    expect((select as HTMLSelectElement).value).toBe('extra_corporate_site_1')
    expect(screen.getByText(formatMoney(19900, 'TRY'))).toBeTruthy()
    expect(screen.getByText('VAT included')).toBeTruthy()

    fireEvent.change(select, { target: { value: 'extra_ecommerce_site_1' } })

    expect(screen.getByText(formatMoney(49900, 'TRY'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Buy \+1 e-commerce site/ }))
    expect(onBuy).toHaveBeenCalledWith('extra_ecommerce_site_1')
  })

  it('updates the email price when the five-mailbox offer is selected', () => {
    const { onBuy } = renderAllowanceCard({
      items: emailItems,
      kind: 'mail',
      selectLabel: 'Email package',
      unitLabelFor: (item) => `+${item.capacity} mailbox${item.capacity === 1 ? '' : 'es'}`,
    })
    const select = screen.getByLabelText('Email package')

    expect((select as HTMLSelectElement).value).toBe('extra_mail_1')
    fireEvent.change(select, { target: { value: 'extra_mail_5' } })

    expect(screen.getByText(formatMoney(19900, 'TRY'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Buy \+5 mailboxes/ }))
    expect(onBuy).toHaveBeenCalledWith('extra_mail_5')
  })

  it('keeps an e-commerce offer disabled on plans that only have corporate capacity', () => {
    const proWebsiteItems = websiteItems.map((item) =>
      item.code === 'extra_ecommerce_site_1' ? { ...item, eligible: false } : item,
    )
    renderAllowanceCard({ items: proWebsiteItems })

    expect((screen.getByRole('option', { name: /Unavailable on your plan/ }) as HTMLOptionElement).disabled).toBe(true)
    expect((screen.getByLabelText('Website allowance') as HTMLSelectElement).value).toBe('extra_corporate_site_1')
  })

  it('preselects the yearly row when the main plan is yearly', () => {
    const yearly: AddOnCatalogItem = {
      ...emailItems[0],
      code: 'extra_mail_1_yearly' as AddOnCatalogItem['code'],
      priceCents: 49000,
      period: 'year',
    }
    renderAllowanceCard({
      items: [...emailItems, yearly],
      kind: 'mail',
      selectLabel: 'Email package',
      defaultPeriod: 'year',
      unitLabelFor: (item) => `+${item.capacity} mailbox`,
    })

    expect((screen.getByLabelText('Email package') as HTMLSelectElement).value).toBe(
      'extra_mail_1_yearly',
    )
    expect(screen.getByTestId('addon-period').textContent).toBe('/ yr')
    expect(screen.getByTestId('addon-period-note').textContent).toBe('Valid for 12 months.')
  })
})
