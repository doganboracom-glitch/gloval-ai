// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ useSWR: vi.fn() }))

vi.mock('swr', () => ({ default: (...args: unknown[]) => mocks.useSWR(...args) }))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: 'en' }) }))

import { GoogleAdsWorkspace } from '@/components/ads/google-ads-workspace'

beforeEach(() => {
  mocks.useSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  mocks.useSWR.mockReset()
})

describe('GoogleAdsWorkspace publish feature gate', () => {
  it('renders nothing and does not fetch when publish access is disabled', () => {
    const { container } = render(
      <GoogleAdsWorkspace enabled={false} connections={[]} initialAddress={null} />,
    )

    expect(container.firstChild).toBeNull()
    expect(mocks.useSWR).toHaveBeenCalledTimes(2)
    expect(mocks.useSWR.mock.calls.every(([key]) => key === null)).toBe(true)
  })

  it('requires a second explicit confirmation after showing the exact publish summary', async () => {
    const plan = {
      id: '123e4567-e89b-42d3-a456-426614174001',
      connection_id: '123e4567-e89b-42d3-a456-426614174000',
      status: 'approved',
      plan: {
        brand: 'Studio campaign',
        country: 'TR',
        language: 'tr',
        cities: ['Istanbul'],
        keywords: ['web design'],
        negativeKeywords: ['free template'],
        finalUrl: 'https://gloval.example/landing',
        adCopy: { headlines: ['Studio headline'], descriptions: ['Studio description'] },
      },
      version: 3,
      approved_version: 3,
      approval_id: '123e4567-e89b-42d3-a456-426614174003',
      approval_hash: 'a'.repeat(64),
      validation_hash: 'a'.repeat(64),
      validated_version: 3,
      eu_political_advertising: 'no' as const,
      currency: 'TRY',
      daily_budget_minor: 15000,
      budget_cap_minor: 90000,
      google_daily_budget_minor: 15000,
      external_campaign_id: null,
      publish_billing_verified: null,
      google_campaign_status: 'PAUSED' as const,
      publish_credit_charged: false,
      approval_summary: null,
    }
    const mutatePlans = vi.fn(async () => undefined)
    mocks.useSWR.mockImplementation((key: unknown) => ({
      data: key === '/api/ads/google/plans' ? { plans: [plan] } : undefined,
      error: undefined,
      isLoading: false,
      mutate: mutatePlans,
    }))
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, state: 'published' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <GoogleAdsWorkspace
        enabled
        connections={[{
          id: '123e4567-e89b-42d3-a456-426614174000',
          externalAccountId: '1234567890',
          name: 'Demo Ads account',
          currency: 'TRY',
          isManager: false,
          loginCustomerId: null,
          status: 'active',
          lastError: null,
          createdAt: new Date(0).toISOString(),
        }]}
        initialAddress={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Studio campaign/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Review before publishing' }))
    expect(screen.getByText('https://gloval.example/landing')).toBeTruthy()
    const reviewHeading = screen.getByRole('heading', { level: 3, name: /review/i })
    const reviewPanel = reviewHeading.closest('section') as HTMLElement
    expect(within(reviewPanel).getByText(/daily budget is not a guaranteed total-spend cap/i)).toBeTruthy()

    const publishButton = screen.getByRole('button', { name: 'Create campaign paused' }) as HTMLButtonElement
    expect(publishButton.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm that the plan shown above/i }))
    expect(publishButton.disabled).toBe(false)
    fireEvent.click(publishButton)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(JSON.parse(String(options?.body))).toMatchObject({ phase: 'publish', publishConfirmed: true })
  })
})
