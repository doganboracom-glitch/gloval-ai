// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MetaConnectionView } from '@/lib/ads/meta-ads-shared'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  requestScan: vi.fn(),
  lang: 'tr' as 'tr' | 'en',
  plans: [] as unknown[],
}))

vi.mock('swr', () => ({ default: (...args: unknown[]) => mocks.useSWR(...args) }))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: mocks.lang }) }))
vi.mock('@/lib/ads/scan-client', () => ({ requestScan: (...args: unknown[]) => mocks.requestScan(...args) }))
vi.mock('@/lib/ads/meta-ai-draft', () => ({
  draftMetaCopyFromScan: () => ({
    primaryText: 'Yeni koleksiyonu keşfedin.',
    headline: 'Yeni koleksiyon',
    description: 'Şimdi keşfedin.',
    cta: 'SHOP_NOW',
  }),
}))

import { MetaPublishPanel } from '@/components/ads/meta-publish-panel'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

const connection = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  externalAccountId: 'act_123456',
  name: 'Gloval mağaza',
  currency: 'TRY',
  status: 'active',
  hasPage: true,
  pageName: 'Gloval Sayfası',
  missingPublishScopes: [],
  missingOptionalScopes: [],
} as unknown as MetaConnectionView

const planContent = {
  name: 'Test planı',
  landingUrl: 'https://example.com/urun',
  primaryText: 'Ürünleri keşfedin.',
  headline: 'Yeni ürünler',
  description: '',
  cta: 'LEARN_MORE',
  countries: ['TR'],
  ageMin: 18,
  ageMax: 65,
  advantageAudience: true,
  gender: 'all',
  optimizationGoal: 'LANDING_PAGE_VIEWS',
  utmTracking: true,
  dailyBudget: '250.50',
  endDate: null,
  imagePath: null,
  specialTopic: 'none',
}

const partialPlan = {
  id: 'plan-1',
  connectionId: connection.id,
  status: 'partial',
  version: 2,
  content: planContent,
  currency: 'TRY',
  approvedVersion: 2,
  validatedVersion: 2,
  objects: { campaignId: 'campaign-existing-123', adSetId: 'adset-existing-123', imageHash: 'image-1', creativeId: 'creative-1', adId: null },
  failureStep: 'ad',
  failureCode: 'age_range_not_allowed',
  failureReason: null,
  dailyBudgetMinor: 25050,
  effectiveStatus: null,
  lastSyncedAt: null,
  live: null,
}

function setupSWR() {
  mocks.useSWR.mockImplementation((key: unknown) => ({
    data: typeof key === 'string' && key.includes('/minimum-budget')
      ? { ok: true, minimumDailyBudgetMinor: 1000 }
      : { ok: true, plans: mocks.plans },
    mutate: vi.fn(),
  }))
}

function renderPanel(connections: MetaConnectionView[] = [connection]) {
  return render(<MetaPublishPanel connections={connections} publishEnabled />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lang = 'tr'
  mocks.plans = []
  setupSWR()
  mocks.requestScan.mockResolvedValue({ ok: true, result: {} })
  vi.stubGlobal('crypto', { randomUUID: () => 'test-request-id' })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:creative-preview') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreateObjectURL })
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: originalRevokeObjectURL })
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
})

describe('MetaPublishPanel', () => {
  it('selects a newly refreshed account when the previous list was empty', async () => {
    const { rerender } = renderPanel([])
    expect(screen.getByText('Önce Ayarlar sekmesinden bir Meta reklam hesabı bağlayın.')).toBeTruthy()

    rerender(<MetaPublishPanel connections={[connection]} publishEnabled />)
    expect(await screen.findByRole('heading', { name: 'Duraklatılmış Meta kampanyası' })).toBeTruthy()
  })

  it('accepts a dropped image, previews its filename, and removes the pending file', async () => {
    renderPanel()
    const dropZone = screen.getByRole('group', { name: 'Reklam görseli yükleme alanı' })
    fireEvent.dragOver(dropZone)
    expect(screen.getByText('Görseli buraya bırakın')).toBeTruthy()

    const image = new File(['png'], 'kampanya.png', { type: 'image/png' })
    fireEvent.drop(dropZone, { dataTransfer: { files: [image] } })

    expect(await screen.findByAltText('Seçilen reklam görselinin önizlemesi')).toBeTruthy()
    expect(screen.getByText('kampanya.png')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Seçilen görseli kaldır' }))
    expect(screen.queryByText('kampanya.png')).toBeNull()
    expect(screen.queryByAltText('Seçilen reklam görselinin önizlemesi')).toBeNull()
  })

  it('shows an inline preparation state, fills editable copy, then focuses and highlights it', async () => {
    let finishScan: ((value: { ok: true; result: unknown }) => void) | undefined
    mocks.requestScan.mockReturnValue(new Promise((resolve) => { finishScan = resolve }))
    renderPanel()
    fireEvent.change(screen.getByLabelText('Hedef sayfa (https)'), { target: { value: 'https://example.com/urun' } })
    fireEvent.click(screen.getByRole('button', { name: 'Siteden AI taslağı öner' }))

    expect(await screen.findByText('Taslak hazırlanıyor…')).toBeTruthy()
    await act(async () => {
      finishScan?.({ ok: true, result: {} })
    })

    const successMessage = await screen.findByText('AI önerisi alanlara yazıldı — gözden geçirin.')
    expect(successMessage.closest('[role="status"]')).toBeTruthy()
    const primaryText = screen.getByLabelText('Ana metin') as HTMLTextAreaElement
    await waitFor(() => expect(document.activeElement).toBe(primaryText))
    expect(primaryText.value).toBe('Yeni koleksiyonu keşfedin.')
    expect(primaryText.className).toContain('motion-safe:animate-pulse')
  })

  it('keeps a partial campaign from resuming after an unsaved plan edit', async () => {
    mocks.plans = [partialPlan]
    renderPanel()
    fireEvent.click(screen.getByText('Test planı'))

    expect(await screen.findByText('campaign-existing-123')).toBeTruthy()
    const continueButton = screen.getByRole('button', { name: 'Devam et' }) as HTMLButtonElement
    expect(continueButton.disabled).toBe(false)

    fireEvent.change(screen.getByLabelText('Yaş (en az)'), { target: { value: '32' } })
    expect(screen.getByText(/Plan içeriği değişti veya doğrulama\/onay güncel değil/)).toBeTruthy()
    expect(continueButton.disabled).toBe(true)
  })
})
