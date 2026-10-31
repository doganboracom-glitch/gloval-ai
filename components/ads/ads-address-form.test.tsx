// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdsAddressForm } from './ads-address-form'
import { dictionary } from '@/lib/i18n'
import { sampleScanResult } from '@/lib/ads/testing/scan-result-fixture'
import type { ClientScanOutcome } from '@/lib/ads/scan-client'

const requestScan = vi.fn<(input: { address: string; requestId: string }) => Promise<ClientScanOutcome>>()
const swrCalls: string[] = []

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: 'tr', t: dictionary.tr }),
}))
vi.mock('swr', () => ({
  default: (key: string) => {
    swrCalls.push(key)
    return { data: undefined }
  },
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/ads/scan-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ads/scan-client')>()
  return { ...actual, requestScan: (input: { address: string; requestId: string }) => requestScan(input) }
})

const copy = dictionary.tr.ads

function submitAddress(value: string) {
  fireEvent.change(screen.getByLabelText(copy.addressLabel), { target: { value } })
  fireEvent.submit(screen.getByLabelText(copy.addressLabel).closest('form')!)
}

beforeEach(() => {
  requestScan.mockReset()
  swrCalls.length = 0
})
afterEach(cleanup)

describe('AdsAddressForm', () => {
  it('asks for the anonymous session as soon as it mounts', () => {
    render(<AdsAddressForm />)
    expect(swrCalls).toContain('/api/ads/session')
    expect(screen.getByText(copy.scanQuotaNote)).toBeTruthy()
  })

  it('does not call the server for an invalid address', () => {
    render(<AdsAddressForm />)
    submitAddress('not an address')
    expect(requestScan).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(copy.addressInvalid)
  })

  it('locks the form while scanning and sends one request per click', async () => {
    let finish!: (outcome: ClientScanOutcome) => void
    requestScan.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    render(<AdsAddressForm />)

    submitAddress('https://ornek.com/hakkimizda')
    await waitFor(() => expect(screen.getByText(copy.scanStageReading)).toBeTruthy())
    submitAddress('ornek.com')

    expect(requestScan).toHaveBeenCalledTimes(1)
    expect(requestScan.mock.calls[0][0].address).toBe('ornek.com')
    expect(requestScan.mock.calls[0][0].requestId.length).toBeGreaterThanOrEqual(8)
    const form = screen.getByLabelText(copy.addressLabel).closest('form')!
    expect(form.getAttribute('aria-busy')).toBe('true')
    expect((screen.getByRole('button', { name: copy.addressSubmit }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => finish({ ok: true, result: sampleScanResult }))
  })

  it('shows the plan, moves focus to its heading and keeps the live region polite', async () => {
    requestScan.mockResolvedValue({ ok: true, result: sampleScanResult })
    const { container } = render(<AdsAddressForm />)
    submitAddress('ornek.com')

    const heading = await screen.findByRole('heading', { level: 2 })
    expect(heading.textContent).toContain('ornek.com')
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
    expect(screen.getByText('Örnek Diş Kliniği')).toBeTruthy()
    expect(screen.getByText(/Diş İmplant Uzmanı \| İstanbul Diş Kliniği \| Randevu Alın/)).toBeTruthy()
    expect(screen.getByText('diş implant fiyatları')).toBeTruthy()
    expect(screen.getByText(copy.previewNote)).toBeTruthy()
    expect((screen.getByRole('button', { name: new RegExp(copy.publishSoon) }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders hostile text from the plan as plain text', async () => {
    const payload = '<img src=x onerror=alert(1)>'
    requestScan.mockResolvedValue({
      ok: true,
      result: { ...sampleScanResult, plan: { ...sampleScanResult.plan, brand: payload } },
    })
    const { container } = render(<AdsAddressForm />)
    submitAddress('ornek.com')
    await screen.findByText(payload)
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the restricted notice only when a category is restricted', async () => {
    requestScan.mockResolvedValue({ ok: true, result: { ...sampleScanResult, restricted: ['health'] as never } })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')
    expect(await screen.findByText(copy.restrictedTitle)).toBeTruthy()
  })

  it('starts over with a fresh requestId after "Yeni tarama"', async () => {
    requestScan.mockResolvedValue({ ok: true, result: sampleScanResult })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')
    fireEvent.click(await screen.findByRole('button', { name: copy.newScan }))
    expect((screen.getByLabelText(copy.addressLabel) as HTMLInputElement).value).toBe('')

    submitAddress('ornek.com')
    await screen.findByRole('heading', { level: 2 })
    const [first, second] = requestScan.mock.calls.map(([call]) => call.requestId)
    expect(first).not.toBe(second)
  })

  it.each([
    ['login_required', copy.errLoginRequired, '/auth/login'],
    ['anon_capacity', copy.errAnonCapacity, '/auth/login'],
  ] as const)('%s offers sign in', async (code, message, href) => {
    requestScan.mockResolvedValue({ ok: false, error: { code } })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(message)
    expect(screen.getByRole('link', { name: copy.actionLogin }).getAttribute('href')).toBe(href)
  })

  it('credits_required shows the cost and balance and links to billing', async () => {
    requestScan.mockResolvedValue({ ok: false, error: { code: 'credits_required', balance: 1 } })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('2 kredi')
    expect(alert.textContent).toContain('(1 kredi)')
    expect(screen.getByRole('link', { name: copy.actionBuyCredits }).getAttribute('href')).toBe('/billing')
  })

  it('unreachable shows the gentle message with a retry button and no raw cause', async () => {
    requestScan.mockResolvedValue({ ok: false, error: { code: 'unreachable' } })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('robots.txt')
    expect(alert.textContent).toContain('hakkından düşülmedi')
    expect(screen.getByRole('button', { name: copy.actionRetry })).toBeTruthy()
  })

  it('a thrown runner becomes the network message instead of a stuck spinner', async () => {
    requestScan.mockRejectedValue(new Error('boom'))
    render(<AdsAddressForm />)
    submitAddress('ornek.com')
    expect((await screen.findByRole('alert')).textContent).toContain(copy.errNetwork)
    expect((screen.getByRole('button', { name: copy.addressSubmit }) as HTMLButtonElement).disabled).toBe(false)
  })
})
