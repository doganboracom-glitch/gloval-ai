// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CheckoutConfirmDialog,
  IYZICO_IFRAME_CARD_FIELDS_SCROLL_OFFSET_PX,
  type CheckoutItem,
} from './checkout-confirm-dialog'

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({
    t: {
      billing: {
        checkout: {
          title: 'Sipariş özeti ve onay',
          back: 'Geri',
          product: 'Ürün',
          vatIncluded: 'KDV dahildir.',
          buyerInfo: 'Fatura bilgileri',
          profileReady: 'Fatura bilgileriniz hazır.',
          profileMissing: 'Fatura bilgilerinizi tamamlayın.',
          editProfile: 'Bilgileri düzenle',
          completeProfile: 'Bilgileri tamamla',
          legalTitle: 'Sözleşmeler ve onaylar',
          consentPreInfo: 'Ön Bilgilendirme Formu’nu okudum, anladım.',
          consentDistance: 'Mesafeli Satış Sözleşmesi’ni okudum ve kabul ediyorum.',
          consentWithdrawal: 'Cayma hakkı bilgilendirmesini okudum.',
          viewContract: 'Görüntüle',
          required: 'Bu alan zorunludur.',
          pay: 'Ödeme yap',
        },
      },
    },
  }),
}))

vi.mock('@/lib/analytics', () => ({ trackBeginCheckout: vi.fn() }))

const item: CheckoutItem = {
  name: 'GLOVAL Pro',
  priceCents: 9_900,
  currency: 'TRY',
  recurring: true,
}

function makeProps(overrides: Partial<Parameters<typeof CheckoutConfirmDialog>[0]> = {}) {
  return {
    open: true,
    item,
    defaultEmail: 'buyer@example.com',
    pending: false,
    profileComplete: true,
    onEditProfile: vi.fn(),
    paymentUrl: null,
    iframeRef: createRef<HTMLIFrameElement>(),
    paymentResult: null,
    onConfirm: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

function acceptConsentsAndPay() {
  const checkboxes = screen.getAllByRole('checkbox')
  fireEvent.click(checkboxes[0])
  fireEvent.click(checkboxes[1])
  fireEvent.click(checkboxes[2])
  fireEvent.click(screen.getByRole('button', { name: 'Ödeme yap' }))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CheckoutConfirmDialog payment step', () => {
  it('moves from the profile and consent step to the secure payment iframe', () => {
    const props = makeProps()
    const { rerender } = render(<CheckoutConfirmDialog {...props} />)

    expect(screen.getByRole('heading', { name: 'Sipariş özeti ve onay' })).not.toBeNull()
    acceptConsentsAndPay()

    expect(props.onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Güvenli ödeme' })).not.toBeNull()

    const paymentUrl = 'https://checkout.iyzico.com/?token=token-123'
    rerender(<CheckoutConfirmDialog {...props} paymentUrl={paymentUrl} />)
    expect(screen.getByTitle('iyzico güvenli ödeme').getAttribute('src')).toBe(`${paymentUrl}&iframe=true`)
  })

  function openPaymentStep(paymentUrl = 'https://checkout.iyzico.com/?token=token-123') {
    const props = makeProps()
    const view = render(<CheckoutConfirmDialog {...props} />)
    acceptConsentsAndPay()
    view.rerender(<CheckoutConfirmDialog {...props} paymentUrl={paymentUrl} />)
    return view
  }

  it('shows the GLOVAL AI logo, a compact summary and a single scroll container', () => {
    const { container } = openPaymentStep()

    const logo = screen.getByAltText('GLOVAL AI')
    expect(logo.getAttribute('src')).toContain('logo.png')
    expect(logo.className).toContain('h-[22px]')
    expect(screen.queryByText('GLOVAL')).toBeNull()

    expect(screen.getByText('GLOVAL Pro')).not.toBeNull()
    expect(screen.getByText('KDV dahildir.')).not.toBeNull()
    expect(screen.getByText(/kart bilgileriniz GLOVAL/)).not.toBeNull()

    expect(container.querySelectorAll('.overflow-y-auto')).toHaveLength(1)
    const frame = screen.getByTitle('iyzico güvenli ödeme').parentElement as HTMLElement
    expect(frame.className).toContain('sm:h-[960px]')
    expect(frame.className).toContain('sm:min-h-[720px]')
    expect(frame.className).not.toMatch(/-m[tblrxy]?-/)
  })

  it('scrolls the body to the card fields once after the iframe loads', () => {
    const { container } = openPaymentStep()
    const body = container.querySelector('.overflow-y-auto') as HTMLElement
    const scrollTo = vi.fn()
    body.scrollTo = scrollTo as unknown as typeof body.scrollTo
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

    const iframe = screen.getByTitle('iyzico güvenli ödeme')
    fireEvent.load(iframe)
    fireEvent.load(iframe)

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: IYZICO_IFRAME_CARD_FIELDS_SCROLL_OFFSET_PX, behavior: 'smooth' }),
    )
  })

  it('scrolls instantly with reduced motion and never after the user has scrolled', () => {
    const { container } = openPaymentStep()
    const body = container.querySelector('.overflow-y-auto') as HTMLElement
    const scrollTo = vi.fn()
    body.scrollTo = scrollTo as unknown as typeof body.scrollTo
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia

    fireEvent.load(screen.getByTitle('iyzico güvenli ödeme'))
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('does not auto-scroll when the buyer already scrolled the body', () => {
    const { container } = openPaymentStep()
    const body = container.querySelector('.overflow-y-auto') as HTMLElement
    const scrollTo = vi.fn()
    body.scrollTo = scrollTo as unknown as typeof body.scrollTo
    body.scrollTop = 40
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

    fireEvent.load(screen.getByTitle('iyzico güvenli ödeme'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('labels the fallback link as the full-page GLOVAL checkout and keeps new-tab behaviour', () => {
    openPaymentStep()
    const link = screen.getByRole('link', { name: 'Tam sayfada aç (GLOVAL logolu)' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('highlights the new-tab fallback after 12 seconds without an iframe signal', () => {
    vi.useFakeTimers()
    const props = makeProps()
    const { rerender } = render(<CheckoutConfirmDialog {...props} />)
    acceptConsentsAndPay()

    rerender(
      <CheckoutConfirmDialog
        {...props}
        paymentUrl="https://checkout.iyzico.com/?token=token-123"
      />,
    )
    act(() => vi.advanceTimersByTime(12_000))

    const fallback = screen.getByRole('link', { name: 'Ödeme ekranı açılmıyor mu? iyzico’da aç' })
    expect(fallback.className).toContain('border-brand')
  })

  it('asks before closing an active payment and respects the buyer’s choice', () => {
    const props = makeProps()
    render(<CheckoutConfirmDialog {...props} />)
    acceptConsentsAndPay()

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const closeButton = screen.getAllByRole('button', { name: 'Kapat' })[0]
    fireEvent.click(closeButton)
    expect(confirm).toHaveBeenCalledWith('Ödeme tamamlanmadı, çıkmak istiyor musun?')
    expect(props.onClose).not.toHaveBeenCalled()

    fireEvent.click(closeButton)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a success state after payment completes', () => {
    const props = makeProps({ paymentResult: 'success' })
    render(<CheckoutConfirmDialog {...props} />)

    expect(screen.getByRole('heading', { name: 'Ödeme başarılı' })).not.toBeNull()
  })

  it('shows a generic Turkish failure and retries without exposing provider details', () => {
    const props = makeProps()
    const { rerender } = render(<CheckoutConfirmDialog {...props} />)
    acceptConsentsAndPay()
    rerender(<CheckoutConfirmDialog {...props} paymentResult="failed" />)

    expect(
      screen.getByText(
        'Ödeme tamamlanamadı. Kartınla ilgili bir sorun olabilir veya ödeme sistemi geçici olarak kullanılamıyor. Başka bir kartla dene ya da destek ile iletişime geç.',
      ),
    ).not.toBeNull()
    expect(screen.queryByText(/200310|IYZICO_API|signature/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })
})
