// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MetaOverviewPlans } from '@/components/ads/meta-overview-plans'
import { META_OVERVIEW_REFRESH_COOLDOWN_MS } from '@/lib/ads/meta-overview-refresh'

const CONNECTION_ID = '5d1f0c52-0b0e-4b1d-8d9e-1c3d6a7b8e90'
const PLAN_A = '0b9c1a2e-1d3f-4a5b-9c7d-8e6f5a4b3c2d'
const PLAN_B = '7a1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8'
const PLAN_DRAFT = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

const OBJECTS = { campaignId: '1', adSetId: '2', adId: '3' }
const NO_OBJECTS = { campaignId: null, adSetId: null, adId: null }

function plan(over: Record<string, unknown> = {}) {
  return {
    id: PLAN_A,
    status: 'active',
    currency: 'TRY',
    effectiveStatus: 'ACTIVE',
    lastSyncedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    live: { spend: { todayMajor: 12.5, last7DaysMajor: null, impressionsToday: 340, impressions7Days: null } },
    objects: OBJECTS,
    content: { name: 'Yaz kampanyası' },
    ...over,
  }
}

const fetchMock = vi.fn()

type Plans = ReturnType<typeof plan>[]

function installFetch(plans: Plans, sync: (planId: string) => unknown | Promise<unknown>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/plans/sync')) {
      const body = JSON.parse(String(init?.body)) as { planId: string }
      const result = await sync(body.planId)
      if (result instanceof Error) throw result
      return { json: async () => result }
    }
    return { json: async () => ({ ok: true, plans }) }
  })
}

const syncCalls = () => fetchMock.mock.calls.filter((call) => String(call[0]).includes('/plans/sync'))

function Wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

function renderPlans(onOpenPlans = vi.fn()) {
  render(
    <Wrapper>
      <MetaOverviewPlans connectionId={CONNECTION_ID} enabled lang="tr" onOpenPlans={onOpenPlans} />
    </Wrapper>,
  )
  return { onOpenPlans }
}

const refreshButton = (name: string) => screen.getByRole('button', { name: `${name} durumunu yenile` }) as HTMLButtonElement

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MetaOverviewPlans: Durumu yenile', () => {
  it('yalnızca Meta\'da nesnesi olan planlarda gösterilir; taslak ve doğrulanmış planlarda gösterilmez', async () => {
    installFetch(
      [
        plan(),
        plan({ id: PLAN_DRAFT, status: 'draft', effectiveStatus: null, objects: NO_OBJECTS, content: { name: 'Taslak plan' }, live: null }),
        plan({ id: PLAN_B, status: 'validated', effectiveStatus: null, objects: NO_OBJECTS, content: { name: 'Doğrulanmış plan' }, live: null }),
      ],
      () => ({ ok: true }),
    )
    renderPlans()
    expect(await screen.findByText('Yaz kampanyası')).toBeTruthy()
    expect(refreshButton('Yaz kampanyası')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Taslak plan durumunu yenile' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Doğrulanmış plan durumunu yenile' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /durumunu yenile/ })).toHaveLength(1)
  })

  it('son eşitleme zamanını ve bugünkü harcamayı gösterir; veri yoksa göstermez', async () => {
    installFetch(
      [
        plan(),
        plan({ id: PLAN_B, content: { name: 'Verisiz plan' }, lastSyncedAt: null, live: null }),
      ],
      () => ({ ok: true }),
    )
    renderPlans()
    expect(await screen.findByText(/Son eşitleme: 2 dk önce/)).toBeTruthy()
    expect(screen.getByText(/Bugün: 12,5 TRY · 340 gösterim/)).toBeTruthy()
    expect(screen.getAllByText(/Son eşitleme/)).toHaveLength(1)
  })

  it('tıklanınca /plans/sync\'i planId ile çağırır; yenilenirken düğme devre dışı olur ve rozet anında güncellenir', async () => {
    let release: (value: unknown) => void = () => undefined
    const gate = new Promise((resolve) => { release = resolve })
    installFetch([plan({ status: 'active', effectiveStatus: 'PENDING_REVIEW' })], async () => {
      await gate
      return { ok: true, synced: true, plan: plan({ status: 'active', effectiveStatus: 'ACTIVE' }), live: null }
    })
    renderPlans()
    await screen.findByText('Yaz kampanyası')
    expect(screen.getByRole('img', { name: /Meta incelemesinde/ })).toBeTruthy()

    fireEvent.click(refreshButton('Yaz kampanyası'))
    await waitFor(() => expect(refreshButton('Yaz kampanyası').disabled).toBe(true))
    expect(refreshButton('Yaz kampanyası').getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Yenileniyor…')).toBeTruthy()
    expect(syncCalls()).toHaveLength(1)
    expect(JSON.parse(String(syncCalls()[0][1].body))).toEqual({ planId: PLAN_A })

    release(undefined)
    await waitFor(() => expect(screen.getByRole('img', { name: /Etkin/ })).toBeTruthy())
    expect(screen.queryByRole('img', { name: /Meta incelemesinde/ })).toBeNull()
    expect(screen.queryByText('Yenileniyor…')).toBeNull()
  })

  it('bir satır yenilenirken diğer satırın düğmesi de devre dışıdır; art arda tıklama ikinci çağrı üretmez', async () => {
    let release: (value: unknown) => void = () => undefined
    const gate = new Promise((resolve) => { release = resolve })
    installFetch(
      [plan(), plan({ id: PLAN_B, content: { name: 'İkinci plan' } })],
      async () => {
        await gate
        return { ok: true, synced: true, plan: plan(), live: null }
      },
    )
    renderPlans()
    await screen.findByText('İkinci plan')

    fireEvent.click(refreshButton('Yaz kampanyası'))
    await waitFor(() => expect(refreshButton('İkinci plan').disabled).toBe(true))
    fireEvent.click(refreshButton('İkinci plan'))
    fireEvent.click(refreshButton('Yaz kampanyası'))
    expect(syncCalls()).toHaveLength(1)

    release(undefined)
    await waitFor(() => expect(screen.queryByText('Yenileniyor…')).toBeNull())
    // Kısa bekleme süresi boyunca düğmeler kapalı kalır.
    expect(refreshButton('Yaz kampanyası').disabled).toBe(true)
    fireEvent.click(refreshButton('İkinci plan'))
    expect(syncCalls()).toHaveLength(1)
  })

  it('bekleme süresi dolunca düğme yeniden etkinleşir', async () => {
    installFetch([plan()], () => ({ ok: true, synced: true, plan: plan(), live: null }))
    renderPlans()
    await screen.findByText('Yaz kampanyası')
    fireEvent.click(refreshButton('Yaz kampanyası'))
    await waitFor(() => expect(syncCalls()).toHaveLength(1))
    await waitFor(() => expect(refreshButton('Yaz kampanyası').disabled).toBe(false), { timeout: META_OVERVIEW_REFRESH_COOLDOWN_MS + 2_000 })
  }, 10_000)

  it('hata olursa satırın altında kısa Türkçe mesaj gösterir ve rozet aynı kalır', async () => {
    installFetch([plan()], () => ({ ok: false, error: 'rate_limited' }))
    renderPlans()
    await screen.findByText('Yaz kampanyası')
    fireEvent.click(refreshButton('Yaz kampanyası'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Çok fazla deneme yaptınız. Biraz bekleyip tekrar deneyin.')
    expect(screen.getByRole('img', { name: /Etkin/ })).toBeTruthy()
  })

  it('ağ hatasında bağlantı mesajı gösterir', async () => {
    installFetch([plan()], () => new Error('network down'))
    renderPlans()
    await screen.findByText('Yaz kampanyası')
    fireEvent.click(refreshButton('Yaz kampanyası'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.')
  })

  it('"Planlar sekmesine git" bağlantısı kalır ve çalışır', async () => {
    installFetch([plan()], () => ({ ok: true }))
    const { onOpenPlans } = renderPlans()
    await screen.findByText('Yaz kampanyası')
    fireEvent.click(screen.getByRole('button', { name: 'Planlar sekmesine git' }))
    expect(onOpenPlans).toHaveBeenCalledTimes(1)
  })
})
