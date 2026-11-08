import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { createMetaApiClient } from '@/lib/ads/meta-api-client'
import {
  activateMetaPlan,
  decideMetaSync,
  pauseMetaPlan,
  preflightMetaActivation,
  readMetaLiveState,
  toLiveSnapshot,
  updateMetaBudget,
  type MetaLiveState,
} from '@/lib/ads/meta-manage'
import { classifyBudgetChange } from '@/lib/ads/meta-manage-ux'
import { describeMetaPublishError } from '@/lib/ads/meta-publish-errors'
import { dailyBudgetToMinor } from '@/lib/ads/meta-publish-plan'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const TOKEN = 'EAAGm0PX4ZCpsBAKsecrettoken1234567890'
const ACCOUNT = 'act_123456789'
const IDS = { campaignId: '111111111111', adSetId: '222222222222', adId: '555555555555' }
const context = { userId: USER_ID, connectionId: '0b9c1a2e-1d3f-4a5b-9c7d-8e6f5a4b3c2d' }

type Call = { method: string; id: string; query: Record<string, string>; form: Record<string, string>; authorization: string | undefined; url: string }
type Handler = (call: Call, index: number) => Response | Error | undefined

type Remote = {
  account: Record<string, unknown>
  campaign: Record<string, unknown>
  adset: Record<string, unknown>
  ad: Record<string, unknown>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function paused(extra: Record<string, unknown> = {}) {
  return { status: 'PAUSED', effective_status: 'PAUSED', ...extra }
}

function freshRemote(): Remote {
  return {
    account: { account_status: 1, currency: 'TRY', funding_source: '123456789' },
    campaign: paused({ id: IDS.campaignId }),
    adset: paused({ id: IDS.adSetId, daily_budget: '10000' }),
    ad: paused({ id: IDS.adId }),
  }
}

/**
 * A stateful fake Graph: POSTs mutate the remote objects so read-backs see the write. `override` can answer any
 * call differently (return undefined to fall through to the healthy behaviour).
 */
function installGraph(remote: Remote, override: Handler = () => undefined) {
  const calls: Call[] = []
  const counts = new Map<string, number>()
  const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
    const method = String(init.method ?? 'GET')
    const id = url.pathname.split('/').slice(2).join('/')
    const form = Object.fromEntries(new URLSearchParams(String(init.body ?? '')))
    const call: Call = {
      method,
      id,
      query: Object.fromEntries(url.searchParams),
      form,
      authorization: (init.headers as Record<string, string>).Authorization,
      url: url.toString(),
    }
    calls.push(call)
    const key = `${method} ${id}`
    const index = counts.get(key) ?? 0
    counts.set(key, index + 1)
    const custom = override(call, index)
    if (custom instanceof Error) throw custom
    if (custom) return custom

    const target = id === ACCOUNT ? remote.account
      : id === IDS.campaignId ? remote.campaign
        : id === IDS.adSetId ? remote.adset
          : id === IDS.adId ? remote.ad
            : id === `${IDS.campaignId}/insights` ? null
              : undefined
    if (id === `${IDS.campaignId}/insights`) {
      return json({ data: [{ spend: call.query.date_preset === 'today' ? '12.5' : '40', impressions: '1000' }] })
    }
    if (!target) return json({ error: { message: 'Unsupported get request', type: 'GraphMethodException', code: 100 } }, 400)
    if (method === 'POST') {
      Object.assign(target, form)
      if (form.status) target.effective_status = form.status
      return json({ success: true })
    }
    return json(target)
  })
  const graph = createMetaApiClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    reserveQuota: async () => true,
    recordOutcome: async () => undefined,
    sleep: async () => undefined,
    log: logSpy,
    apiVersion: 'v24.0',
  })
  const posts = () => calls.filter((call) => call.method === 'POST')
  return { graph, calls, posts, fetchImpl }
}

const logSpy = vi.fn()

function common(graph: ReturnType<typeof installGraph>['graph']) {
  return { graph, accessToken: TOKEN, context, accountId: ACCOUNT, apiVersion: 'v24.0' }
}

const timeout = () => Object.assign(new Error('timeout'), { name: 'TimeoutError' })

beforeEach(() => {
  logSpy.mockReset()
})

describe('etkinleştirme ön kontrolleri', () => {
  it('hesap aktif değilse (account_status != 1) account_restricted ile durur, Meta\'ya yazılmaz', async () => {
    const remote = freshRemote()
    remote.account.account_status = 2
    const g = installGraph(remote)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result).toMatchObject({ ok: false, step: 'preflight', unknown: false })
    expect(!result.ok && result.failure.code).toBe('account_restricted')
    expect(g.posts()).toHaveLength(0)
  })

  it('ödeme yöntemi yoksa payment_required olarak yeniden adlandırılır, yazma yok', async () => {
    const remote = freshRemote()
    remote.account.funding_source = null
    const g = installGraph(remote)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(!result.ok && result.failure.code).toBe('payment_required')
    expect(!result.ok && result.failure.message).toContain('ödeme yöntemi')
    expect(g.posts()).toHaveLength(0)
  })

  it('hesap para birimi plandakinden farklıysa activation_blocked, yazma yok', async () => {
    const remote = freshRemote()
    remote.account.currency = 'USD'
    const g = installGraph(remote)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(!result.ok && result.failure.code).toBe('activation_blocked')
    expect(!result.ok && result.failure.message).toContain('para birimi')
    expect(g.posts()).toHaveLength(0)
  })

  it('para birimi karşılaştırması büyük/küçük harfe duyarsızdır', async () => {
    const remote = freshRemote()
    remote.account.currency = 'try'
    const g = installGraph(remote)
    const result = await preflightMetaActivation({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result.ok).toBe(true)
  })

  it.each(['DISAPPROVED', 'WITH_ISSUES'])('reklam %s ise ad_disapproved, Meta\'nın gerekçesi gösterilir ve yazma yok', async (state) => {
    const remote = freshRemote()
    remote.ad.effective_status = state
    remote.ad.ad_review_feedback = { global: { 'Ad uses restricted content': 'Reklam metni kısıtlı içerik barındırıyor' } }
    const g = installGraph(remote)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result).toMatchObject({ ok: false, step: 'preflight' })
    if (result.ok) throw new Error('beklenmeyen başarı')
    expect(result.failure.code).toBe('ad_disapproved')
    expect(result.failure.message).toContain('Meta reklamı onaylamadı')
    expect(result.failure.metaReason).toContain('kısıtlı içerik')
    expect(result.live?.ad.effectiveStatus).toBe(state)
    expect(g.posts()).toHaveLength(0)
  })

  it.each(['ARCHIVED', 'DELETED'])('nesnelerden biri %s ise etkinleştirilemez', async (state) => {
    const remote = freshRemote()
    remote.adset.status = state
    const g = installGraph(remote)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(!result.ok && result.failure.code).toBe('activation_blocked')
    expect(g.posts()).toHaveLength(0)
  })

  it('durum okunamazsa ön kontrol güvenli koda çevrilen bir hata ile durur', async () => {
    const g = installGraph(freshRemote(), (call) =>
      call.method === 'GET' && call.id === IDS.adId
        ? json({ error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } }, 401)
        : undefined)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(!result.ok && result.failure.code).toBe('reauth_required')
    expect(g.posts()).toHaveLength(0)
  })
})

describe('etkinleştirme sırası', () => {
  it('kampanya, reklam seti, reklam sırasıyla yalnızca status=ACTIVE yazar ve doğrular', async () => {
    const g = installGraph(freshRemote())
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result).toMatchObject({ ok: true, verified: true })
    expect(g.posts().map((call) => call.id)).toEqual([IDS.campaignId, IDS.adSetId, IDS.adId])
    expect(g.posts().every((call) => JSON.stringify(call.form) === JSON.stringify({ status: 'ACTIVE' }))).toBe(true)
    expect(result.ok && result.live?.campaign.status).toBe('ACTIVE')
  })

  it('zaten ACTIVE olan nesneler atlanır; yalnızca eksik olanlar yazılır', async () => {
    const remote = freshRemote()
    remote.campaign.status = 'ACTIVE'
    remote.adset.status = 'ACTIVE'
    const g = installGraph(remote)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result.ok).toBe(true)
    expect(g.posts().map((call) => call.id)).toEqual([IDS.adId])
  })

  it('hepsi ACTIVE ise hiç yazma yapılmaz', async () => {
    const remote = freshRemote()
    remote.campaign.status = 'ACTIVE'
    remote.adset.status = 'ACTIVE'
    remote.ad.status = 'ACTIVE'
    const g = installGraph(remote)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result).toMatchObject({ ok: true, verified: true })
    expect(g.posts()).toHaveLength(0)
  })

  it('reklam seti reddedilirse reklama geçilmez; kampanya ACTIVE kalır ve adım adset olarak bildirilir', async () => {
    const g = installGraph(freshRemote(), (call) =>
      call.method === 'POST' && call.id === IDS.adSetId
        ? json({ error: { message: 'Invalid parameter', type: 'OAuthException', code: 100 } }, 400)
        : undefined)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result).toMatchObject({ ok: false, step: 'adset', unknown: false })
    expect(g.posts().map((call) => call.id)).toEqual([IDS.campaignId, IDS.adSetId])
    expect(!result.ok && result.live?.campaign.status).toBe('ACTIVE')
  })
})

describe('duraklatma', () => {
  it('yalnızca kampanyayı PAUSED yapar; reklam seti ve reklama dokunmaz', async () => {
    const remote = freshRemote()
    remote.campaign.status = 'ACTIVE'
    remote.adset.status = 'ACTIVE'
    remote.ad.status = 'ACTIVE'
    const g = installGraph(remote)
    const result = await pauseMetaPlan({ ...common(g.graph), ids: IDS })
    expect(result).toMatchObject({ ok: true, verified: true })
    expect(g.posts()).toHaveLength(1)
    expect(g.posts()[0]).toMatchObject({ id: IDS.campaignId, form: { status: 'PAUSED' } })
    expect(remote.adset.status).toBe('ACTIVE')
    expect(remote.ad.status).toBe('ACTIVE')
  })

  it('duraklatma ön kontrol (hesap/ödeme) okumaları yapmaz; ödeme sorunu duraklatmayı engellemez', async () => {
    const remote = freshRemote()
    remote.account.funding_source = null
    remote.campaign.status = 'ACTIVE'
    const g = installGraph(remote)
    const result = await pauseMetaPlan({ ...common(g.graph), ids: IDS })
    expect(result.ok).toBe(true)
    expect(g.calls.some((call) => call.id === ACCOUNT)).toBe(false)
  })
})

describe('bütçe dönüşümü ve güncelleme', () => {
  it('TRY (100 alt birim) tutarını kuruşa çevirir', () => {
    expect(dailyBudgetToMinor('100', 'TRY')).toEqual({ ok: true, minor: 10_000 })
    expect(dailyBudgetToMinor('100,5', 'TRY')).toEqual({ ok: true, minor: 10_050 })
    expect(dailyBudgetToMinor('99.99', 'TRY')).toEqual({ ok: true, minor: 9_999 })
    expect(dailyBudgetToMinor('1.005', 'TRY')).toMatchObject({ ok: false, error: 'too_many_decimals' })
  })

  it('0 ondalıklı para biriminde (JPY) tutar olduğu gibi gider, ondalık reddedilir', () => {
    expect(dailyBudgetToMinor('1500', 'JPY')).toEqual({ ok: true, minor: 1_500 })
    expect(dailyBudgetToMinor('1500.5', 'JPY')).toMatchObject({ ok: false, error: 'too_many_decimals' })
    expect(dailyBudgetToMinor('1500.0', 'JPY')).toEqual({ ok: true, minor: 1_500 })
  })

  it('geçersiz, sıfır ve desteklenmeyen para birimini reddeder', () => {
    expect(dailyBudgetToMinor('0', 'TRY')).toMatchObject({ ok: false, error: 'amount_too_small' })
    expect(dailyBudgetToMinor('abc', 'TRY')).toMatchObject({ ok: false, error: 'invalid_amount' })
    expect(dailyBudgetToMinor('-5', 'TRY')).toMatchObject({ ok: false, error: 'invalid_amount' })
    expect(dailyBudgetToMinor('10', null)).toMatchObject({ ok: false, error: 'currency_unsupported' })
  })

  it('artış, azalış, aynı ve geçersiz değişimi sınıflandırır', () => {
    expect(classifyBudgetChange(10_000, 15_000)).toBe('increase')
    expect(classifyBudgetChange(10_000, 5_000)).toBe('decrease')
    expect(classifyBudgetChange(10_000, 10_000)).toBe('same')
    expect(classifyBudgetChange(10_000, null)).toBe('invalid')
    expect(classifyBudgetChange(10_000, 0)).toBe('invalid')
    expect(classifyBudgetChange(null, 5_000)).toBe('increase')
  })

  it('reklam setine tam sayı alt birim olarak daily_budget yazar ve doğrular', async () => {
    const g = installGraph(freshRemote())
    const result = await updateMetaBudget({ ...common(g.graph), ids: IDS, dailyBudgetMinor: 15_050 })
    expect(result).toMatchObject({ ok: true, verified: true })
    expect(g.posts()).toHaveLength(1)
    expect(g.posts()[0]).toMatchObject({ id: IDS.adSetId, form: { daily_budget: '15050' } })
  })

  it('bütçe azaltma da aynı tek yazma ile yapılır', async () => {
    const g = installGraph(freshRemote())
    const result = await updateMetaBudget({ ...common(g.graph), ids: IDS, dailyBudgetMinor: 5_000 })
    expect(result.ok && result.live?.adSet.dailyBudgetMinor).toBe(5_000)
    expect(g.posts()).toHaveLength(1)
  })

  it('bütçe çok düşükse budget_too_low koduna çevrilir', async () => {
    const g = installGraph(freshRemote(), (call) =>
      call.method === 'POST'
        ? json({ error: { message: 'Invalid parameter', type: 'OAuthException', code: 100, error_data: { blame_field_specs: [['daily_budget']] } } }, 400)
        : undefined)
    const result = await updateMetaBudget({ ...common(g.graph), ids: IDS, dailyBudgetMinor: 1 })
    expect(result).toMatchObject({ ok: false, step: 'adset', unknown: false })
    expect(!result.ok && result.failure.code).toBe('budget_too_low')
  })
})

describe('yazma çağrılarında yeniden deneme yok', () => {
  it('geçici 5xx yazma hatasında tek POST atılır; sonuç GET ile doğrulanır', async () => {
    const remote = freshRemote()
    const g = installGraph(remote, (call) =>
      call.method === 'POST' ? json({ error: { message: 'Service unavailable', code: 2 } }, 503) : undefined)
    const result = await pauseMetaPlan({ ...common(g.graph), ids: IDS })
    expect(g.posts()).toHaveLength(1)
    // Kampanya zaten PAUSED olduğu için okuma-doğrulama değişikliğin uygulandığını gösterir.
    expect(result.ok).toBe(true)
  })

  it('5xx sonrası okuma farklı bir değer gösterirse kesin başarısızlıktır (belirsiz değil), yine tek POST', async () => {
    const remote = freshRemote()
    const g = installGraph(remote, (call) =>
      call.method === 'POST' ? json({ error: { message: 'Service unavailable', code: 2 } }, 503) : undefined)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result).toMatchObject({ ok: false, step: 'campaign', unknown: false })
    expect(g.posts()).toHaveLength(1)
  })

  it('oran sınırı hatasında da POST tekrarlanmaz', async () => {
    const g = installGraph(freshRemote(), (call) =>
      call.method === 'POST' ? json({ error: { message: 'Too many calls', type: 'OAuthException', code: 17 } }, 400) : undefined)
    const result = await pauseMetaPlan({ ...common(g.graph), ids: IDS })
    expect(result.ok).toBe(false)
    expect(g.posts()).toHaveLength(1)
  })

  it('okuma (GET) çağrıları geçici hatada yeniden denenir', async () => {
    const g = installGraph(freshRemote(), (call, index) =>
      call.method === 'GET' && call.id === IDS.campaignId && index === 0 ? json({ error: { message: 'x', code: 2 } }, 503) : undefined)
    const live = await readMetaLiveState({ ...common(g.graph), ids: IDS, includeSpend: false })
    expect(live.campaign.status).toBe('PAUSED')
    expect(g.calls.filter((call) => call.id === IDS.campaignId)).toHaveLength(2)
  })
})

describe('zaman aşımı ve ağ hatasında belirsiz sonuç', () => {
  it('POST zaman aşımına uğrar, GET değişikliğin uygulandığını gösterir: başarı sayılır, tek POST', async () => {
    const remote = freshRemote()
    remote.campaign.status = 'ACTIVE'
    const g = installGraph(remote, (call) => (call.method === 'POST' ? timeout() : undefined))
    const result = await pauseMetaPlan({ ...common(g.graph), ids: IDS })
    // Okuma ACTIVE gösterir, PAUSED beklenir: uygulanmadı, kesin başarısızlık (belirsiz değil).
    expect(result).toMatchObject({ ok: false, unknown: false })
    expect(g.posts()).toHaveLength(1)
  })

  it('zaman aşımı sonrası okuma beklenen değeri gösterirse (uygulanmış) başarı sayılır', async () => {
    const remote = freshRemote()
    const g = installGraph(remote, (call) => {
      if (call.method !== 'POST') return undefined
      remote.adset.daily_budget = '7500'
      return timeout()
    })
    const result = await updateMetaBudget({ ...common(g.graph), ids: IDS, dailyBudgetMinor: 7_500 })
    expect(result).toMatchObject({ ok: true, verified: true })
    expect(g.posts()).toHaveLength(1)
  })

  it('zaman aşımı ve okuma da başarısızsa sonuç "belirsiz" (unknown) olur ve write_outcome_unknown mesajı verilir', async () => {
    const g = installGraph(freshRemote(), (call, index) => {
      if (call.method === 'POST') return timeout()
      if (call.id === IDS.campaignId && index >= 1) return new Error('network down')
      return undefined
    })
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result).toMatchObject({ ok: false, step: 'campaign', unknown: true })
    expect(!result.ok && result.failure.code).toBe('write_outcome_unknown')
    expect(g.posts()).toHaveLength(1)
    // Kampanya yazması belirsiz olduğu için reklam seti ve reklama geçilmez.
    expect(g.posts().map((call) => call.id)).toEqual([IDS.campaignId])
  })

  it('bağlantı kopması (fetch reddi) yazmada belirsiz sayılır', async () => {
    const g = installGraph(freshRemote(), (call, index) => {
      if (call.method === 'POST') return new TypeError('fetch failed')
      // updateMetaBudget has no preflight: the first adset GET is the read-back itself.
      if (call.id === IDS.adSetId && index >= 0) return new TypeError('fetch failed')
      return undefined
    })
    const result = await updateMetaBudget({ ...common(g.graph), ids: IDS, dailyBudgetMinor: 5_000 })
    expect(result).toMatchObject({ ok: false, unknown: true })
    expect(g.posts()).toHaveLength(1)
  })

  it('belirsiz sonuç bir sonraki senkronda düzelir: Meta ACTIVE gösterirse plan active olur', async () => {
    const remote = freshRemote()
    const g = installGraph(remote, (call, index) => {
      if (call.method === 'POST') return timeout()
      if (call.id === IDS.campaignId && index >= 1) return new Error('network down')
      return undefined
    })
    const first = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(first).toMatchObject({ ok: false, unknown: true })

    // Gecikmeli olarak Meta'nın uyguladığı değişiklik sonraki okumada görünür.
    remote.campaign.status = 'ACTIVE'
    remote.adset.status = 'ACTIVE'
    remote.ad.status = 'ACTIVE'
    const later = installGraph(remote)
    const live = await readMetaLiveState({ ...common(later.graph), ids: IDS, includeSpend: false })
    const decision = decideMetaSync({ status: 'published', dailyBudgetMinor: 10_000 }, live)
    expect(decision).toMatchObject({ planStatus: 'active', drift: true })
  })
})

describe('canlı durum ve sapma kararı', () => {
  function live(overrides: Partial<{ campaign: string; adset: string; ad: string; budget: number | null; adEffective: string }> = {}): MetaLiveState {
    return {
      campaign: { status: overrides.campaign ?? 'PAUSED', effectiveStatus: null },
      adSet: { status: overrides.adset ?? 'PAUSED', effectiveStatus: null, dailyBudgetMinor: overrides.budget === undefined ? 10_000 : overrides.budget },
      ad: { status: overrides.ad ?? 'PAUSED', effectiveStatus: overrides.adEffective ?? null, reviewFeedback: null },
      spend: null,
      fetchedAt: '2026-01-01T00:00:00.000Z',
    }
  }

  it('hiç etkinleştirilmemiş (published) ve hâlâ duraklı plan sapma sayılmaz', () => {
    expect(decideMetaSync({ status: 'published', dailyBudgetMinor: 10_000 }, live())).toMatchObject({ planStatus: null, budgetMinor: null, drift: false })
  })

  it('Ads Manager\'da elle açma: published -> active', () => {
    expect(decideMetaSync({ status: 'published', dailyBudgetMinor: 10_000 }, live({ campaign: 'ACTIVE', adset: 'ACTIVE', ad: 'ACTIVE' })))
      .toMatchObject({ planStatus: 'active', drift: true })
  })

  it('Ads Manager\'da elle kapama: active -> user_paused', () => {
    expect(decideMetaSync({ status: 'active', dailyBudgetMinor: 10_000 }, live({ campaign: 'PAUSED', adset: 'ACTIVE', ad: 'ACTIVE' })))
      .toMatchObject({ planStatus: 'user_paused', drift: true })
  })

  it('arşivlenen/silinen nesne planı archived yapar', () => {
    expect(decideMetaSync({ status: 'active', dailyBudgetMinor: 10_000 }, live({ campaign: 'ACTIVE', adset: 'DELETED', ad: 'ACTIVE' })))
      .toMatchObject({ planStatus: 'archived', drift: true })
  })

  it('bütçe elle değiştirilmişse yeni bütçe alınır, aynıysa alınmaz, 0/boşsa alınmaz', () => {
    expect(decideMetaSync({ status: 'user_paused', dailyBudgetMinor: 10_000 }, live({ budget: 25_000 }))).toMatchObject({ budgetMinor: 25_000, drift: true })
    expect(decideMetaSync({ status: 'user_paused', dailyBudgetMinor: 10_000 }, live({ budget: 10_000 }))).toMatchObject({ budgetMinor: null })
    expect(decideMetaSync({ status: 'user_paused', dailyBudgetMinor: 10_000 }, live({ budget: null }))).toMatchObject({ budgetMinor: null })
    expect(decideMetaSync({ status: 'user_paused', dailyBudgetMinor: 10_000 }, live({ budget: 0 }))).toMatchObject({ budgetMinor: null })
  })

  it('harcama okunamazsa durum okuması yine başarılıdır (spend null)', async () => {
    const g = installGraph(freshRemote(), (call) =>
      call.id.endsWith('/insights') ? json({ error: { message: 'x', code: 2 } }, 500) : undefined)
    const result = await readMetaLiveState({ ...common(g.graph), ids: IDS })
    expect(result.spend).toBeNull()
    expect(result.campaign.status).toBe('PAUSED')
  })

  it('harcama bugün + son 7 gün olarak birleştirilir', async () => {
    const g = installGraph(freshRemote())
    const result = await readMetaLiveState({ ...common(g.graph), ids: IDS })
    expect(result.spend).toEqual({ todayMajor: 12.5, last7DaysMajor: 52.5, impressionsToday: 1000, impressions7Days: 2000 })
  })

  it('anlık görüntü yalnızca izinli alanları taşır', () => {
    const snapshot = toLiveSnapshot(live())
    expect(Object.keys(snapshot).sort()).toEqual(['ad', 'adSet', 'campaign', 'fetchedAt', 'spend'])
  })
})

describe('Meta hatalarının güvenli kod ve Türkçe mesaja çevrilmesi', () => {
  it.each([
    ['reauth_required', 'reauth_required', 'süresi dolmuş'],
    ['token_expired', 'reauth_required', 'süresi dolmuş'],
    ['permission_missing', 'publish_permission_missing', 'yönetim izni'],
    ['rate_limited', 'rate_limited', 'istek sınırı'],
    ['write_outcome_unknown', 'write_outcome_unknown', 'yanıt vermedi'],
    ['provider_unavailable', 'provider_unavailable', 'yanıt vermedi'],
  ] as const)('%s -> %s', (input, code, fragment) => {
    const failure = describeMetaPublishError(new MetaAdsError(input), 'campaign')
    expect(failure.code).toBe(code)
    expect(failure.message).toContain(fragment)
  })

  it('bilinmeyen (MetaAdsError olmayan) hata genel Türkçe mesaj verir ve ham hata metnini sızdırmaz', () => {
    const failure = describeMetaPublishError(new Error(`secret ${TOKEN}`), 'adset')
    expect(failure.code).toBe('meta_rejected')
    expect(failure.message).toContain('Reklam seti')
    expect(JSON.stringify(failure)).not.toContain(TOKEN)
  })

  it('Meta bir alan için reddederse Türkçe alan adı mesajda yer alır', () => {
    const detail = { code: 100, subcode: null, type: 'OAuthException', message: 'Invalid parameter', userMessage: null, blameFields: ['targeting'], traceId: null }
    const failure = describeMetaPublishError(new MetaAdsError('meta_rejected', detail as never), 'adset')
    expect(failure.code).toBe('meta_rejected')
    expect(failure.message).toContain('hedef kitle')
  })

  it('Advantage+ yaş sınırı reddini güvenli Türkçe mesaja çevirir', () => {
    const detail = {
      code: 100,
      subcode: 1870189,
      type: 'OAuthException',
      message: 'You can add a lower maximum age as a suggestion.',
      userMessage: null,
      blameFields: ['age_max'],
      traceId: 'provider-trace',
    }
    const failure = describeMetaPublishError(new MetaAdsError('meta_rejected', detail as never), 'adset')
    expect(failure.code).toBe('age_range_not_allowed')
    expect(failure.message).toContain('Advantage+')
    expect(failure.message).toContain('65')
    expect(failure.metaReason).toBeNull()
    expect(failure.blamedFields).toEqual(['yaş aralığı'])
    expect(JSON.stringify(failure)).not.toMatch(/1870189|age_max|provider-trace/i)
  })
})

describe('token sızıntısı yok', () => {
  it('token yalnızca Authorization başlığında gider; URL, günlük ve sonuç nesnesinde bulunmaz', async () => {
    const remote = freshRemote()
    const g = installGraph(remote, (call) =>
      call.method === 'POST' && call.id === IDS.adSetId
        ? json({ error: { message: `Invalid OAuth access token ${TOKEN}`, type: 'OAuthException', code: 100 } }, 400)
        : undefined)
    const result = await activateMetaPlan({ ...common(g.graph), ids: IDS, planCurrency: 'TRY' })
    expect(result.ok).toBe(false)
    expect(g.calls.length).toBeGreaterThan(0)
    for (const call of g.calls) {
      expect(call.url).not.toContain(TOKEN)
      expect(call.authorization).toBe(`Bearer ${TOKEN}`)
      expect(JSON.stringify(call.form)).not.toContain(TOKEN)
    }
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(TOKEN)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it('belirsiz sonuçta (zaman aşımı) da token çıktıda yoktur', async () => {
    const g = installGraph(freshRemote(), (call) => (call.method === 'POST' ? timeout() : undefined))
    const result = await pauseMetaPlan({ ...common(g.graph), ids: IDS })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(TOKEN)
  })
})
