// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MetaManageCard, type MetaManagedPlan } from '@/components/ads/meta-manage-card'

const PLAN_ID = '0b9c1a2e-1d3f-4a5b-9c7d-8e6f5a4b3c2d'

function plan(over: Partial<MetaManagedPlan> = {}): MetaManagedPlan {
  return {
    id: PLAN_ID,
    status: 'published',
    currency: 'TRY',
    dailyBudgetMinor: 10_000,
    effectiveStatus: null,
    lastSyncedAt: '2026-01-01T00:00:00Z',
    live: null,
    content: { name: 'Yaz kampanyası' },
    ...over,
  }
}

type Responder = (url: string, body: Record<string, unknown>) => unknown

const fetchMock = vi.fn()

function installFetch(responder: Responder) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const result = responder(url, body)
    if (result instanceof Error) throw result
    return { json: async () => result }
  })
}

/** By default the live sync answers with the same plan the card was rendered with (nothing changed in Meta). */
function syncOk(p: MetaManagedPlan) {
  return { ok: true, synced: true, drift: false, plan: p, live: p.live }
}

const manageCalls = () => fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/manage'))
const manageBody = (index = 0) => JSON.parse(String(manageCalls()[index][1].body)) as Record<string, unknown>

function Wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

function renderCard(p: MetaManagedPlan, props: Partial<{ canManage: boolean; canManageProtective: boolean; hasManagementScope: boolean; onGoToSettings: () => void; onChanged: () => void }> = {}) {
  const onChanged = props.onChanged ?? vi.fn()
  const view = render(
    <Wrapper>
      <MetaManageCard
        plan={p}
        campaignUrl={null}
        canManage={props.canManage ?? true}
        canManageProtective={props.canManageProtective ?? true}
        hasManagementScope={props.hasManagementScope ?? true}
        onChanged={onChanged}
        onGoToSettings={props.onGoToSettings}
      />
    </Wrapper>,
  )
  return { ...view, onChanged }
}

async function settled() {
  await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/sync'))).toBe(true))
  await waitFor(() => expect(screen.queryByText('Güncelleniyor…')).toBeNull())
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const queryButton = (name: string | RegExp) => screen.queryByRole('button', { name })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('crypto', { randomUUID: () => '9b2f4c1e-7a3d-4e58-8c1b-2f6d9a0e5b71' })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MetaManageCard: durum rozeti', () => {
  it.each([
    ['published', null, 'Duraklatıldı'],
    ['user_paused', null, 'Duraklatıldı'],
    ['active', null, 'Etkin'],
    ['active', 'PENDING_REVIEW', 'Meta incelemesinde'],
    ['active', 'DISAPPROVED', 'Reddedildi'],
  ])('%s + %s -> "%s"', async (status, effectiveStatus, label) => {
    const p = plan({ status, effectiveStatus })
    installFetch(() => syncOk(p))
    renderCard(p)
    await settled()
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('Meta incelemesindeki etkin plan için açıklama notu gösterilir', async () => {
    const p = plan({ status: 'active', effectiveStatus: 'PENDING_REVIEW' })
    installFetch(() => syncOk(p))
    renderCard(p)
    await settled()
    expect(screen.getByText(/Meta incelemesinde; onaylanana kadar/)).toBeTruthy()
  })

  it('yönetilemeyen durumda (taslak) hiçbir şey çizilmez', async () => {
    const p = plan({ status: 'draft' })
    installFetch(() => syncOk(p))
    const { container } = renderCard(p)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.querySelector('section')).toBeNull()
  })
})

describe('MetaManageCard: butonların görünürlüğü', () => {
  it('tam izin + published: etkinleştir ve bütçe var, duraklat yok', async () => {
    const p = plan({ status: 'published' })
    installFetch(() => syncOk(p))
    renderCard(p, { canManage: true, canManageProtective: true })
    await settled()
    expect(queryButton('Kampanyayı etkinleştir')).toBeTruthy()
    expect(queryButton('Duraklat')).toBeNull()
    expect(queryButton('Bütçeyi güncelle')).toBeTruthy()
  })

  it('tam izin + active: duraklat var, etkinleştir yok', async () => {
    const p = plan({ status: 'active' })
    installFetch(() => syncOk(p))
    renderCard(p)
    await settled()
    expect(queryButton('Duraklat')).toBeTruthy()
    expect(queryButton('Kampanyayı etkinleştir')).toBeNull()
  })

  it('tam izin + user_paused: yeniden etkinleştirilebilir', async () => {
    const p = plan({ status: 'user_paused' })
    installFetch(() => syncOk(p))
    renderCard(p)
    await settled()
    expect(queryButton('Kampanyayı etkinleştir')).toBeTruthy()
  })

  it('yalnızca koruyucu izin + active: duraklat ve yalnızca-düşürme bütçesi var, etkinleştir yok', async () => {
    const p = plan({ status: 'active' })
    installFetch(() => syncOk(p))
    renderCard(p, { canManage: false, canManageProtective: true })
    await settled()
    expect(queryButton('Duraklat')).toBeTruthy()
    expect(queryButton('Kampanyayı etkinleştir')).toBeNull()
    expect(screen.getByText(/yalnızca düşürülebilir/)).toBeTruthy()
  })

  it('yalnızca koruyucu izin + published: etkinleştir yok', async () => {
    const p = plan({ status: 'published' })
    installFetch(() => syncOk(p))
    renderCard(p, { canManage: false, canManageProtective: true })
    await settled()
    expect(queryButton('Kampanyayı etkinleştir')).toBeNull()
    expect(queryButton('Duraklat')).toBeNull()
  })

  it('hiç izin yok: butonlar yok', async () => {
    const p = plan({ status: 'active' })
    installFetch(() => syncOk(p))
    renderCard(p, { canManage: false, canManageProtective: false })
    await settled()
    expect(queryButton('Duraklat')).toBeNull()
    expect(queryButton('Kampanyayı etkinleştir')).toBeNull()
    expect(queryButton('Bütçeyi güncelle')).toBeNull()
  })

  it('yönetim kapsamı (ads_management) yoksa "Ayarlar\'a git" gösterilir ve eylem butonları yoktur', async () => {
    const p = plan({ status: 'active' })
    installFetch(() => syncOk(p))
    const onGoToSettings = vi.fn()
    renderCard(p, { hasManagementScope: false, onGoToSettings })
    await settled()
    const go = button(/Ayarlar'a git/)
    fireEvent.click(go)
    expect(onGoToSettings).toHaveBeenCalledTimes(1)
    expect(queryButton('Duraklat')).toBeNull()
    expect(queryButton('Kampanyayı etkinleştir')).toBeNull()
    expect(queryButton('Bütçeyi güncelle')).toBeNull()
  })
})

describe('MetaManageCard: etkinleştirme onayı', () => {
  it('onay kutusu işaretlenmeden "Onayla ve etkinleştir" kapalıdır ve istek atılmaz', async () => {
    const p = plan({ status: 'published' })
    installFetch(() => syncOk(p))
    renderCard(p)
    await settled()
    fireEvent.click(button('Kampanyayı etkinleştir'))
    const confirm = button('Onayla ve etkinleştir')
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(manageCalls()).toHaveLength(0)
    expect(screen.getByText(/günde en fazla 100 TRY/)).toBeTruthy()
  })

  it('onay işaretlenince termsAccepted=true ile tek istek gönderilir', async () => {
    const p = plan({ status: 'published' })
    const active = plan({ status: 'active' })
    installFetch((url) => (url.endsWith('/manage') ? { ok: true, verified: true, plan: active, live: null } : syncOk(p)))
    const { onChanged } = renderCard(p)
    await settled()
    fireEvent.click(button('Kampanyayı etkinleştir'))
    fireEvent.click(screen.getByRole('checkbox'))
    const confirm = button('Onayla ve etkinleştir')
    await waitFor(() => expect(confirm.disabled).toBe(false))
    fireEvent.click(confirm)
    await waitFor(() => expect(manageCalls()).toHaveLength(1))
    expect(manageBody()).toMatchObject({ planId: PLAN_ID, action: 'activate', termsAccepted: true, requestId: '9b2f4c1e-7a3d-4e58-8c1b-2f6d9a0e5b71' })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await screen.findByText(/Kampanya etkinleştirildi/)).toBeTruthy()
  })

  it('"Vazgeç" onay kutusunu kapatır', async () => {
    const p = plan({ status: 'published' })
    installFetch(() => syncOk(p))
    renderCard(p)
    await settled()
    fireEvent.click(button('Kampanyayı etkinleştir'))
    fireEvent.click(button('Vazgeç'))
    expect(queryButton('Onayla ve etkinleştir')).toBeNull()
    expect(manageCalls()).toHaveLength(0)
  })

  it('sunucu hata dönerse Türkçe hata mesajı gösterilir', async () => {
    const p = plan({ status: 'published' })
    installFetch((url) => (url.endsWith('/manage') ? { ok: false, error: 'payment_required', message: 'Ödeme yöntemi yok.', plan: p, live: null } : syncOk(p)))
    renderCard(p)
    await settled()
    fireEvent.click(button('Kampanyayı etkinleştir'))
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(button('Onayla ve etkinleştir').disabled).toBe(false))
    fireEvent.click(button('Onayla ve etkinleştir'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Ödeme yöntemi yok.')
  })
})

describe('MetaManageCard: bütçe', () => {
  const budgetInput = () => screen.getByLabelText(/Yeni günlük bütçe/) as HTMLInputElement

  it('artış onay kutusu işaretlenmeden gönderilemez; işaretlenince termsAccepted=true gider', async () => {
    const p = plan({ status: 'user_paused' })
    installFetch((url) => (url.endsWith('/manage') ? { ok: true, verified: true, plan: p, live: null } : syncOk(p)))
    renderCard(p)
    await settled()
    fireEvent.change(budgetInput(), { target: { value: '150' } })
    const update = button('Bütçeyi güncelle')
    expect(update.disabled).toBe(true)
    const consent = await screen.findByRole('checkbox')
    expect(screen.getByText(/Günlük bütçeyi 150 TRY olarak güncellemeyi onaylıyorum/)).toBeTruthy()
    fireEvent.click(consent)
    await waitFor(() => expect(update.disabled).toBe(false))
    fireEvent.click(update)
    await waitFor(() => expect(manageCalls()).toHaveLength(1))
    expect(manageBody()).toMatchObject({ action: 'budget', dailyBudget: '150', termsAccepted: true })
  })

  it('azaltma onaysız gönderilebilir ve onay kutusu çıkmaz; termsAccepted gönderilmez', async () => {
    const p = plan({ status: 'user_paused' })
    installFetch((url) => (url.endsWith('/manage') ? { ok: true, verified: true, plan: p, live: null } : syncOk(p)))
    renderCard(p)
    await settled()
    fireEvent.change(budgetInput(), { target: { value: '40' } })
    expect(screen.queryByRole('checkbox')).toBeNull()
    const update = button('Bütçeyi güncelle')
    expect(update.disabled).toBe(false)
    fireEvent.click(update)
    await waitFor(() => expect(manageCalls()).toHaveLength(1))
    expect(manageBody()).toMatchObject({ action: 'budget', dailyBudget: '40' })
    expect(manageBody().termsAccepted).toBeUndefined()
  })

  it('aynı bütçe girilirse buton kapalı ve uyarı görünür', async () => {
    const p = plan({ status: 'user_paused' })
    installFetch(() => syncOk(p))
    renderCard(p)
    await settled()
    fireEvent.change(budgetInput(), { target: { value: '100' } })
    expect(button('Bütçeyi güncelle').disabled).toBe(true)
    expect(screen.getByText('Yeni bütçe mevcut bütçeyle aynı.')).toBeTruthy()
  })

  it('geçersiz tutar hata ipucu gösterir ve gönderimi kapatır', async () => {
    const p = plan({ status: 'user_paused' })
    installFetch(() => syncOk(p))
    renderCard(p)
    await settled()
    fireEvent.change(budgetInput(), { target: { value: '1.234' } })
    expect(button('Bütçeyi güncelle').disabled).toBe(true)
    expect(screen.getByText('Bütçede en fazla iki ondalık basamak kullanılabilir.')).toBeTruthy()
  })

  it('yalnızca koruyucu izinle artış engellenir (onay kutusu yok, istek yok); azaltma serbesttir', async () => {
    const p = plan({ status: 'active' })
    installFetch((url) => (url.endsWith('/manage') ? { ok: true, verified: true, plan: p, live: null } : syncOk(p)))
    renderCard(p, { canManage: false, canManageProtective: true })
    await settled()
    fireEvent.change(budgetInput(), { target: { value: '250' } })
    expect(button('Bütçeyi güncelle').disabled).toBe(true)
    expect(screen.getByText('Bütçeyi artırmak için tam yönetim izni gerekir.')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()

    fireEvent.change(budgetInput(), { target: { value: '30' } })
    expect(button('Bütçeyi güncelle').disabled).toBe(false)
  })
})

describe('MetaManageCard: duraklatma', () => {
  it('onay istemeden tek istek gönderir', async () => {
    const p = plan({ status: 'active' })
    const paused = plan({ status: 'user_paused' })
    installFetch((url) => (url.endsWith('/manage') ? { ok: true, verified: true, plan: paused, live: null } : syncOk(p)))
    renderCard(p)
    await settled()
    fireEvent.click(button('Duraklat'))
    await waitFor(() => expect(manageCalls()).toHaveLength(1))
    expect(manageBody()).toMatchObject({ action: 'pause' })
    expect(manageBody().termsAccepted).toBeUndefined()
    expect(await screen.findByText(/Kampanya duraklatıldı/)).toBeTruthy()
  })
})

describe('MetaManageCard: "Durumu yenile" hatası', () => {
  it('senkron başarısız olursa son kayıtlı bilgi (bütçe, durum) gösterilir ve açıklama çıkar', async () => {
    const p = plan({ status: 'active', dailyBudgetMinor: 25_000 })
    installFetch(() => ({ ok: false, error: 'provider_error' }))
    renderCard(p)
    expect(await screen.findByText('Meta durumu şu an okunamadı; son kayıtlı bilgi gösteriliyor.')).toBeTruthy()
    expect(screen.getByText('250 TRY')).toBeTruthy()
    expect(screen.getByText('Etkin')).toBeTruthy()
  })

  it('ağ hatasında da son kayıtlı bilgi kalır', async () => {
    const p = plan({ status: 'user_paused', dailyBudgetMinor: 10_000 })
    installFetch(() => new Error('network down'))
    renderCard(p)
    expect(await screen.findByText(/son kayıtlı bilgi gösteriliyor/)).toBeTruthy()
    expect(screen.getByText('100 TRY')).toBeTruthy()
    expect(screen.getByText('Duraklatıldı')).toBeTruthy()
  })

  it('"Durumu yenile" tıklanınca yeniden okur; yine başarısızsa kayıtlı bilgi korunur', async () => {
    const p = plan({ status: 'active', dailyBudgetMinor: 10_000 })
    installFetch(() => ({ ok: false, error: 'provider_error' }))
    renderCard(p)
    await screen.findByText(/son kayıtlı bilgi gösteriliyor/)
    const before = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/sync')).length
    fireEvent.click(button(/Durumu yenile/))
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/sync')).length).toBeGreaterThan(before))
    await waitFor(() => expect(button(/Durumu yenile/).disabled).toBe(false))
    expect(screen.getByText('100 TRY')).toBeTruthy()
    expect(screen.getByText(/son kayıtlı bilgi gösteriliyor/)).toBeTruthy()
  })

  it('başarılı senkron güncel planı gösterir (Ads Manager\'da değişen bütçe)', async () => {
    const stored = plan({ status: 'active', dailyBudgetMinor: 10_000 })
    const fresh = plan({ status: 'user_paused', dailyBudgetMinor: 30_000 })
    installFetch(() => ({ ok: true, synced: true, drift: true, plan: fresh, live: null }))
    renderCard(stored)
    expect(await screen.findByText('300 TRY')).toBeTruthy()
    expect(screen.getByText('Duraklatıldı')).toBeTruthy()
    expect(screen.queryByText(/son kayıtlı bilgi/)).toBeNull()
  })
})
