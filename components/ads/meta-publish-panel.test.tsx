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

const savedImagePlan = {
  ...partialPlan,
  status: 'draft',
  approvedVersion: null,
  validatedVersion: null,
  failureStep: null,
  failureCode: null,
  content: {
    ...planContent,
    imagePath: 'user-id/9f23a5a1-1234-4e76-bac3-11a9e1234567.png',
    imageFilename: 'saved-campaign.png',
  },
  hasStoredImage: true,
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
  vi.unstubAllGlobals()
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

  it('shows the saved version summary and blocks resuming a partial campaign after an unsaved edit', async () => {
    mocks.plans = [partialPlan]
    renderPanel()
    fireEvent.click(screen.getByText('Test planı'))

    expect(await screen.findByText('campaign-existing-123')).toBeTruthy()
    expect(screen.getByText('Kayıtlı sürüm')).toBeTruthy()
    expect(screen.getByText('v2')).toBeTruthy()
    expect(screen.getByText('18–65')).toBeTruthy()
    expect(screen.getByText(/250,50/)).toBeTruthy()

    const continueButton = screen.getByRole('button', { name: 'Devam et' }) as HTMLButtonElement
    expect(continueButton.disabled).toBe(false)

    fireEvent.change(screen.getByLabelText('Yaş (en az)'), { target: { value: '32' } })
    expect(screen.getByText('Formdaki değişiklikler kaydedilmedi. Önce \'Kaydet ve Meta ile doğrula\'ya basın, sonra onaylayıp devam edin.')).toBeTruthy()
    expect(continueButton.disabled).toBe(true)
  })

  it('shows the safe age-range message and keeps masked Meta text under technical details', async () => {
    mocks.plans = [{ ...partialPlan, failureReason: '(#100) You can add a lower maximum age as a suggestion. 1870189' }]
    renderPanel()
    fireEvent.click(screen.getByText('Test planı'))

    expect(await screen.findByText('Meta Advantage+ kitle, en çok yaşın 65 olmasını ister. Yaş aralığını 18-65 yapın.')).toBeTruthy()
    const detailsLabel = screen.getByText('Teknik ayrıntı')
    expect(detailsLabel.tagName).toBe('SUMMARY')
    fireEvent.click(detailsLabel)
    expect(screen.getByText(/lower maximum age/)).toBeTruthy()
    expect(screen.queryByText(/1870189|#100/)).toBeNull()
  })

  it('edits and validates a saved-image plan without uploading the image again', async () => {
    mocks.plans = [savedImagePlan]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.endsWith('/validate')
        ? { ok: true, checked: [] }
        : { ok: true, plan: savedImagePlan }
      return { ok: true, json: async () => payload }
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPanel()
    fireEvent.click(screen.getByText('Test planı'))

    expect(await screen.findByAltText('Kayıtlı reklam görselinin önizlemesi')).toBeTruthy()
    expect(screen.getByText('saved-campaign.png')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Görseli değiştir' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Yaş (en az)'), { target: { value: '32' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet ve Meta ile doğrula' }))

    expect(await screen.findByText('Meta doğrulaması geçti. Onaylayıp oluşturabilirsiniz; henüz hiçbir şey oluşturulmadı.')).toBeTruthy()
    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(requestedUrls).toContain('/api/ads/meta/plans')
    expect(requestedUrls).toContain('/api/ads/meta/plans/validate')
    expect(requestedUrls.some((url) => url.endsWith('/image'))).toBe(false)
  })

  it('still requires an image when the plan has no saved creative', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet ve Meta ile doğrula' }))
    expect(screen.getByText('Reklam için bir görsel yükleyin (JPG veya PNG, en çok 5 MB).')).toBeTruthy()
  })

  it('uploads a newly selected image as the replacement for a saved creative', async () => {
    mocks.plans = [savedImagePlan]
    const replacementPlan = {
      ...savedImagePlan,
      version: savedImagePlan.version + 1,
      content: {
        ...savedImagePlan.content,
        imagePath: 'user-id/2a23a5a1-1234-4e76-bac3-11a9e1234567.png',
        imageFilename: 'replacement.png',
      },
    }
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url = String(input)
  const payload = url.endsWith('/image')
        ? { ok: true, plan: replacementPlan }
        : url.endsWith('/validate')
          ? { ok: true, checked: [] }
          : { ok: true, plan: savedImagePlan }
      return { ok: true, json: async () => payload }
    })
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderPanel()
    fireEvent.click(screen.getByText('Test planı'))
    await screen.findByText('saved-campaign.png')
    fireEvent.click(screen.getByRole('button', { name: 'Görseli değiştir' }))
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const replacement = new File(['png'], 'replacement.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [replacement] } })
    expect(screen.getByText('replacement.png')).toBeTruthy()
    expect(input.value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet ve Meta ile doğrula' }))
    expect(await screen.findByText('Meta doğrulaması geçti. Onaylayıp oluşturabilirsiniz; henüz hiçbir şey oluşturulmadı.')).toBeTruthy()
    const uploadCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/image'))
    expect(uploadCall).toBeTruthy()
    const uploadedForm = uploadCall?.[1]?.body as FormData
    expect((uploadedForm.get('file') as File).name).toBe('replacement.png')
  })
})
