// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_ACTION_COSTS, SERVICE_DETAIL_REQUEST_TIMEOUT_MS } from '@/lib/ai-action-costs'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'
import { ServiceDetailFields } from '@/components/editor/service-detail-fields'

vi.mock('@/components/editor/published-context', () => ({
  useEditorProjectId: () => null,
  useSitePublished: () => false,
}))

const services = {
  type: 'services' as const,
  title: 'Hizmetler',
  items: [{ title: 'Kahve eğitimi', description: 'Demleme atölyesi ve uygulamalı eğitim.' }],
  detail: { pageEnabled: true, linkEnabled: true },
}

function props(onDispatch = vi.fn()) {
  const base = fallbackWebsite('Kahve atölyesi', 'tr')
  const sections = [...base.sections.filter((section) => section.type !== 'services'), services]
  const site = { ...base, sections } as WebsiteSchema
  return { site, index: sections.length - 1, section: services, onDispatch }
}

function openServiceCard() {
  fireEvent.click(screen.getByRole('button', { name: /1\. Kahve eğitimi/ }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('service detail editor AI action', () => {
  it('shows the shared one-credit price and no minimum word counter or goal', () => {
    render(<ServiceDetailFields {...props()} />)
    openServiceCard()

    expect(AI_ACTION_COSTS.serviceDetail).toBe(1)
    expect(screen.getByText('1 kredi / üretim')).toBeTruthy()
    expect(screen.queryByText(/kelime|hedef: en az/i)).toBeNull()
    expect(screen.queryByText(/at least 300 words|goal: at least/i)).toBeNull()
  })

  it('uses the deadline to end a pending request, clear the spinner, and show a localized timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          },
          { once: true },
        )
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<ServiceDetailFields {...props()} />)
    openServiceCard()
    fireEvent.click(screen.getByRole('button', { name: 'AI ile metin yaz' }))

    expect(screen.getByRole('button', { name: 'Yazılıyor…' })).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVICE_DETAIL_REQUEST_TIMEOUT_MS)
    })

    expect(screen.getByRole('status').textContent).toContain('İstek zaman aşımına uğradı')
    expect(screen.getByRole('button', { name: 'AI ile metin yaz' })).toBeTruthy()
  })

  it('applies every generated field returned by the API', async () => {
    const onDispatch = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            blocks: [{ heading: 'Kapsam', body: 'Atölye içeriği.' }],
            description: 'Kahve demleme eğitiminde kullanılan kısa ve anlaşılır bir açıklama.',
            icon: 'coffee',
            charged: AI_ACTION_COSTS.serviceDetail,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    render(<ServiceDetailFields {...props(onDispatch)} />)
    openServiceCard()
    fireEvent.click(screen.getByRole('button', { name: 'AI ile metin yaz' }))

    await waitFor(() => {
      expect(onDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          op: 'updateServiceItem',
          patch: expect.objectContaining({
            blocks: [{ heading: 'Kapsam', body: 'Atölye içeriği.' }],
            description: 'Kahve demleme eğitiminde kullanılan kısa ve anlaşılır bir açıklama.',
            icon: 'coffee',
            pageEnabled: true,
          }),
        }),
      )
    })
  })
})
