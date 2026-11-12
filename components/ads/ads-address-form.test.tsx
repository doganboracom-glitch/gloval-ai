// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdsAddressForm } from './ads-address-form'
import { dictionary } from '@/lib/i18n'
import { sampleScanResult } from '@/lib/ads/testing/scan-result-fixture'
import type { ClientScanOutcome } from '@/lib/ads/scan-client'
import type { ManualPlanInput } from '@/lib/ads/manual-plan'

const requestScan = vi.fn<
  (input: { address: string; requestId: string; manual?: ManualPlanInput }) => Promise<ClientScanOutcome>
>()
const swrCalls: string[] = []
let handoffAccess: { state: string; connectionId?: string } | undefined

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: 'tr', t: dictionary.tr }),
}))
vi.mock('swr', () => ({
  default: (key: string) => {
    swrCalls.push(key)
    return { data: key === '/api/ads/google/handoff-access' ? handoffAccess : undefined }
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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
  return {
    ...actual,
    requestScan: (input: { address: string; requestId: string; manual?: ManualPlanInput }) => requestScan(input),
  }
})

const copy = dictionary.tr.ads
const globalStyles = readFileSync('app/globals.css', 'utf8')
const sharedInputSource = readFileSync('components/ui/input.tsx', 'utf8')

function submitAddress(value: string) {
  fireEvent.change(screen.getByLabelText(copy.addressLabel), { target: { value } })
  fireEvent.submit(screen.getByLabelText(copy.addressLabel).closest('form')!)
}

beforeEach(() => {
  requestScan.mockReset()
  swrCalls.length = 0
  handoffAccess = undefined
})
afterEach(cleanup)

describe('AdsAddressForm', () => {
  it('asks for the anonymous session as soon as it mounts', () => {
    render(<AdsAddressForm />)
    expect(swrCalls).toContain('/api/ads/session')
    expect(screen.getByText(copy.scanQuotaNote)).toBeTruthy()
  })

  it('requires an address before starting a scan', () => {
    render(<AdsAddressForm />)
    submitAddress('')

    const input = screen.getByLabelText(copy.addressLabel)
    expect(requestScan).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(copy.addressRequired)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain('ads-address-error')
  })

  it('shows an inline error and does not call the server for an invalid address', () => {
    render(<AdsAddressForm />)
    submitAddress('not an address')

    const input = screen.getByLabelText(copy.addressLabel)
    expect(requestScan).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(copy.addressInvalid)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain('ads-address-error')
  })

  it('fills an example chip and clears validation without submitting', () => {
    render(<AdsAddressForm />)
    submitAddress('not an address')

    fireEvent.click(screen.getByRole('button', { name: 'ornek.com' }))

    const input = screen.getByLabelText(copy.addressLabel) as HTMLInputElement
    expect(input.value).toBe('ornek.com')
    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(requestScan).not.toHaveBeenCalled()
  })

  it('uses an iOS-safe 18px website address input', () => {
    render(<AdsAddressForm />)
    const input = screen.getByLabelText(copy.addressLabel)
    expect(input.className).toContain('text-lg')
    expect(input.className).toContain('ads-address-input')
    expect(input.getAttribute('aria-label')).toBe(copy.addressLabel)
    expect(input.getAttribute('placeholder')).toBe('')
  })

  it('uses theme-aware autofill styles on the address and shared inputs without changing focus or radius', () => {
    render(<AdsAddressForm />)
    const input = screen.getByLabelText(copy.addressLabel)
    const frame = input.closest('[data-invalid]')
    const autofillRule = globalStyles.match(/input\.theme-aware-autofill:is\(:-webkit-autofill, :autofill\)[\s\S]*?\{([^}]*)\}/)
    const autofillDeclarations = autofillRule?.[1] ?? ''

    expect(input.className).toContain('theme-aware-autofill')
    expect(frame?.className).toContain('rounded-3xl')
    expect(frame?.className).toContain('focus-within:ring-4')
    expect(frame?.className).toContain('focus-within:ring-brand/20')
    expect(sharedInputSource).toContain('theme-aware-autofill h-8')
    expect(sharedInputSource).toContain('rounded-lg')
    expect(sharedInputSource).toContain('focus-visible:ring-3')
    expect(autofillRule?.[0]).toContain(':-webkit-autofill')
    expect(autofillRule?.[0]).toContain(':autofill')
    expect(autofillDeclarations).toContain('background-color: var(--autofill-background, var(--card)) !important;')
    expect(autofillDeclarations).toContain('-webkit-text-fill-color: var(--foreground) !important;')
    expect(autofillDeclarations).toContain('caret-color: var(--foreground) !important;')
    expect(autofillDeclarations).toContain('inset 0 0 0 1000px var(--autofill-background, var(--card))')
    expect(autofillDeclarations).toContain('var(--tw-ring-offset-shadow')
    expect(autofillDeclarations).toContain('var(--tw-ring-shadow')
    expect(autofillDeclarations).toContain('transition: background-color 9999s ease-out 0s !important;')
    expect(autofillDeclarations).not.toMatch(/border-radius|outline\s*:/)
  })

  it('keeps the mobile address field at least 64px tall and full width', () => {
    render(<AdsAddressForm />)
    const input = screen.getByLabelText(copy.addressLabel)
    const form = input.closest('form')!
    const button = screen.getByRole('button', { name: copy.addressSubmit })

    expect(input.className).toContain('h-16')
    expect(input.className).toContain('w-full')
    expect(input.className).toContain('min-w-0')
    expect(input.className).toContain('text-lg')
    expect(form.className).toContain('max-w-[47.5rem]')
    expect(button.className).toContain('h-14')
  })

  it('shows aria-hidden guidance while empty and blurred', () => {
    render(<AdsAddressForm />)
    const input = screen.getByLabelText(copy.addressLabel)
    const guidance = screen.getByText(copy.addressGuidance)

    expect(guidance.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(guidance.closest('[aria-hidden="true"]')?.className).toContain('pointer-events-none')
    expect(guidance.className).toContain('ads-address-guidance-motion')
    expect(input.getAttribute('aria-label')).toBe(copy.addressLabel)
  })

  it('hides guidance on focus and restores it after blur while empty', () => {
    render(<AdsAddressForm />)
    const input = screen.getByLabelText(copy.addressLabel)

    fireEvent.focus(input)
    expect(screen.queryByText(copy.addressGuidance)).toBeNull()
    fireEvent.blur(input)
    expect(screen.queryByText(copy.addressGuidance)).not.toBeNull()
  })

  it('hides guidance as soon as the user starts typing', () => {
    render(<AdsAddressForm />)
    const input = screen.getByLabelText(copy.addressLabel)

    fireEvent.change(input, { target: { value: 'ornek.com' } })

    expect(screen.queryByText(copy.addressGuidance)).toBeNull()
  })

  it('keeps guidance visible but static for reduced-motion users', () => {
    render(<AdsAddressForm />)
    expect(screen.getByText(copy.addressGuidance)).toBeTruthy()

    const reducedMotionRule = globalStyles.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.ads-address-guidance-motion\s*\{([^}]*)\}/,
    )
    expect(reducedMotionRule?.[1]).toContain('animation: none;')
    expect(reducedMotionRule?.[1]).toContain('opacity: 1;')
    expect(reducedMotionRule?.[1]).toContain('transform: none;')
    expect(globalStyles).toContain('animation: ads-address-guidance 2.4s ease-in-out infinite;')
    expect(globalStyles).toContain('transform: translateX(14px);')
  })

  it.each([
    ['tr', 'Web site linkini buraya gir'],
    ['en', 'Enter your website link here'],
    ['de', 'Website-Link hier eingeben'],
    ['fr', 'Entrez le lien du site ici'],
    ['es', 'Escribe aquí el enlace web'],
    ['it', 'Inserisci qui il link del sito'],
  ] as const)('%s has translated address guidance', (locale, expected) => {
    expect(dictionary[locale].ads.addressGuidance).toBe(expected)
  })

  it('cleans an https URL in the field and submits only its host', async () => {
    requestScan.mockResolvedValue({ ok: false, error: { code: 'unreachable' } })
    render(<AdsAddressForm />)
    submitAddress('https://ornek.com/hakkimizda')

    const input = screen.getByLabelText(copy.addressLabel) as HTMLInputElement
    await waitFor(() => expect(requestScan).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(input.value).toBe('ornek.com'))
    expect(requestScan.mock.calls[0][0].address).toBe('ornek.com')
    await screen.findByRole('alert')
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
    expect(screen.queryByText(copy.comingSoon)).toBeNull()
    expect((screen.getByRole('button', { name: copy.publishAction }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers sign in with a return path to the workspace when signed out', async () => {
    handoffAccess = { state: 'signed_out' }
    requestScan.mockResolvedValue({ ok: true, result: sampleScanResult })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')

    const link = await screen.findByRole('link', { name: copy.actionLogin })
    const href = link.getAttribute('href')!
    expect(href.startsWith('/auth/login?next=')).toBe(true)
    const next = new URL(href, 'https://gloval.ai').searchParams.get('next')!
    expect(next).toBe(`/ads/dashboard?url=${encodeURIComponent(sampleScanResult.host)}`)
    expect(screen.queryByText(copy.comingSoon)).toBeNull()
  })

  it('starts the Google connect flow when signed in without a connected account', async () => {
    handoffAccess = { state: 'needs_connect' }
    requestScan.mockResolvedValue({ ok: true, result: sampleScanResult })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')

    const button = (await screen.findByRole('button', { name: copy.publishAction })) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    const form = button.closest('form')!
    expect(form.getAttribute('action')).toBe('/api/ads/google/connect')
    expect(form.getAttribute('method')?.toLowerCase()).toBe('post')
  })

  it('offers the plan transfer when a Google account is ready', async () => {
    handoffAccess = { state: 'ready', connectionId: 'conn-1' }
    requestScan.mockResolvedValue({ ok: true, result: sampleScanResult })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')

    const button = (await screen.findByRole('button', { name: 'Bu planı Google Ads’e hazırla' })) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('explains an unavailable state without a coming-soon label', async () => {
    handoffAccess = { state: 'unavailable' }
    requestScan.mockResolvedValue({ ok: true, result: sampleScanResult })
    render(<AdsAddressForm />)
    submitAddress('ornek.com')

    expect(await screen.findByText(copy.publishUnavailable)).toBeTruthy()
    expect(screen.queryByText(copy.comingSoon)).toBeNull()
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

  it.each(['site_blocked', 'site_unresponsive'] as const)(
    'offers the manual plan form for %s without exposing crawler internals',
    async (code) => {
      requestScan.mockResolvedValue({ ok: false, error: { code } })
      render(<AdsAddressForm />)
      submitAddress('https://ornek.com/hakkimizda')

      expect(await screen.findByRole('heading', { level: 3, name: copy.manualFallback.title })).toBeTruthy()
      expect(screen.getByLabelText(copy.manualFallback.businessLabel)).toBeTruthy()
      expect(screen.getByLabelText(copy.manualFallback.servicesLabel)).toBeTruthy()
      expect(screen.queryByText(/private network|raw response|stack/i)).toBeNull()
    },
  )

  it('submits manual details through the same address route and labels the result as unverified', async () => {
    requestScan
      .mockResolvedValueOnce({ ok: false, error: { code: 'site_blocked' } })
      .mockResolvedValueOnce({ ok: true, result: { ...sampleScanResult, source: 'manual' } })
    render(<AdsAddressForm />)
    submitAddress('https://ornek.com/hakkimizda')

    const businessName = await screen.findByLabelText(copy.manualFallback.businessLabel)
    const industry = screen.getByLabelText(copy.manualFallback.industryLabel)
    const services = screen.getByLabelText(copy.manualFallback.servicesLabel)
    const location = screen.getByLabelText(copy.manualFallback.locationLabel)
    fireEvent.change(businessName, { target: { value: 'Northline Studio' } })
    fireEvent.change(industry, { target: { value: 'Custom furniture' } })
    fireEvent.change(services, { target: { value: 'Made-to-measure tables' } })
    fireEvent.change(location, { target: { value: 'Ankara' } })
    fireEvent.submit(businessName.closest('form')!)

    await screen.findByRole('heading', { level: 2, name: copy.manualFallback.resultTitle })
    expect(requestScan).toHaveBeenCalledTimes(2)
    expect(requestScan.mock.calls[1][0]).toMatchObject({
      address: 'ornek.com',
      manual: {
        businessName: 'Northline Studio',
        industry: 'Custom furniture',
        services: 'Made-to-measure tables',
        location: 'Ankara',
        language: 'tr',
      },
    })
    expect(screen.getByRole('note').textContent).toBe(copy.manualFallback.note)
  })

  it('retries the same address with a fresh request id and no cached scan', async () => {
    requestScan
      .mockResolvedValueOnce({ ok: false, error: { code: 'unreachable' } })
      .mockResolvedValueOnce({ ok: true, result: sampleScanResult })
    render(<AdsAddressForm />)
    submitAddress('https://ornek.com/hakkimizda')

    fireEvent.click(await screen.findByRole('button', { name: copy.actionRetry }))
    await screen.findByRole('heading', { level: 2 })

    expect(requestScan).toHaveBeenCalledTimes(2)
    expect(requestScan.mock.calls[0][0].address).toBe('ornek.com')
    expect(requestScan.mock.calls[1][0].address).toBe('ornek.com')
    expect(requestScan.mock.calls[1][0].requestId).not.toBe(requestScan.mock.calls[0][0].requestId)
  })

  it('a thrown runner becomes the network message instead of a stuck spinner', async () => {
    requestScan.mockRejectedValue(new Error('boom'))
    render(<AdsAddressForm />)
    submitAddress('ornek.com')
    expect((await screen.findByRole('alert')).textContent).toContain(copy.errNetwork)
    expect((screen.getByRole('button', { name: copy.addressSubmit }) as HTMLButtonElement).disabled).toBe(false)
  })
})
