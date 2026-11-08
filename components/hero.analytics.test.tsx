// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'
import { metaEventIds } from '@/lib/analytics/event-ids'
import { resetVendor, setVendorReady } from '@/lib/analytics'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getUser: vi.fn(),
  createProject: vi.fn(),
  websiteToPlan: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@/components/language-provider', () => {
  const section = new Proxy({ samples: [], loadingSteps: [] }, {
    get(target, key: string) {
      if (key in target) return target[key as keyof typeof target]
      return key
    },
  })
  const t = new Proxy({}, { get: () => section })
  return { useLanguage: () => ({ lang: 'tr', t }) }
})

vi.mock('@/components/voice/voice-input-button', () => ({ VoiceInputButton: () => null }))
vi.mock('@/components/ads/ads-product-switch', () => ({ AdsProductSwitch: () => null }))
vi.mock('@/components/plan-result', () => ({ PlanResult: () => null }))
vi.mock('@/components/website-preview', () => ({ WebsitePreview: () => null }))
vi.mock('@/lib/voice/voice-registry', () => ({ stopAllVoiceInput: vi.fn() }))
vi.mock('@/lib/website-schema', () => ({ websiteToPlan: mocks.websiteToPlan }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/projects', () => ({ createProject: mocks.createProject }))
vi.mock('@/lib/pending-project', () => ({
  stashPendingProject: vi.fn(),
  peekPendingProject: vi.fn(() => null),
  clearPendingProject: vi.fn(),
  newToken: vi.fn(() => 'generated-site-token'),
}))
vi.mock('@/lib/signup-draft-client', () => ({
  clearSignupIdea: vi.fn(),
  storeSignupIdea: vi.fn(() => true),
  takeSignupIdea: vi.fn(() => null),
}))
vi.mock('@/lib/analytics-config', () => ({
  GA_MEASUREMENT_ID: null,
  META_PIXEL_ID: '123456789012345',
  isMeasurementSurface: () => true,
}))

import { Hero } from './hero'

type Source = 'ai' | 'fallback'

const website = {
  meta: { name: 'Örnek site', audience: 'yerel işletme', language: 'tr' },
  sections: [],
}

let source: Source
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
let pixel: ReturnType<typeof vi.fn>

function bridgePayload() {
  const call = fetchMock.mock.calls.find(([input]) => String(input) === '/api/analytics/meta-event')
  expect(call).toBeDefined()
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>
}

beforeEach(() => {
  source = 'ai'
  mocks.routerPush.mockReset()
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mocks.createProject.mockReset().mockResolvedValue('project-42')
  mocks.websiteToPlan.mockReset().mockReturnValue({ siteName: 'Örnek site' })
  pixel = vi.fn()
  Object.defineProperty(window, 'fbq', { configurable: true, value: pixel })
  resetVendor('meta')
  setVendorReady('meta')
  document.cookie = `${CONSENT_COOKIE}=; max-age=0; path=/`
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, marketing: true }))}; path=/`

  fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (String(input) === '/api/generate') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ website, source }),
      } as Response
    }
    if (String(input) === '/api/analytics/meta-event') {
      return { ok: true, status: 202, json: async () => ({}) } as Response
    }
    throw new Error(`Unexpected fetch: ${String(input)}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  resetVendor('meta')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'fbq', { configurable: true, value: undefined })
})

describe('homepage generate → save and edit flow', () => {
  it.each<Source>(['ai', 'fallback'])(
    'reports one completed-site event for a successful %s generation and opens the editor',
    async (generationSource) => {
      source = generationSource
      render(<Hero />)

      fireEvent.change(screen.getByPlaceholderText('placeholder'), {
        target: { value: 'Bir kafe için web sitesi oluştur' },
      })
      const generateButton = screen.getByRole('button', { name: 'button' })
      await act(async () => {
        generateButton.click()
        generateButton.click()
      })
      await screen.findByRole('button', { name: 'save & edit' })

      const generateCalls = fetchMock.mock.calls.filter(([input]) => String(input) === '/api/generate')
      expect(generateCalls).toHaveLength(1)

      const pixelCall = pixel.mock.calls.find(
        ([method, name]) => method === 'trackCustom' && name === 'GenerateSiteCompleted',
      )
      expect(pixelCall).toBeDefined()
      expect(pixelCall?.[2]).toEqual({ source: generationSource })

      const payload = bridgePayload()
      expect(payload).toMatchObject({ type: 'generate_site_completed', source: generationSource })
      expect(pixelCall?.[3]).toEqual({ eventID: metaEventIds.generate(String(payload.nonce)) })
      expect(
        pixel.mock.calls.filter(([, name]) => name === 'GenerateSiteCompleted'),
      ).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: 'save & edit' }))
      await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledWith('/editor/project-42'))
      expect(mocks.createProject).toHaveBeenCalledTimes(1)
    },
  )
})
