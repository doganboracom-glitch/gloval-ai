import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { resolveMetaReadDailyLimits, resolveMetaWriteDailyLimits } from '@/lib/ads/env'
import { createMetaApiClient, isMetaWriteEndpoint, type MetaQuotaReservation } from '@/lib/ads/meta-api-client'
import {
  EMPTY_OBJECTS,
  findObjectByTag,
  preflightMetaAccount,
  publishPausedMetaCampaign,
  validateMetaPlanRemote,
  type MetaPublishObjects,
} from '@/lib/ads/meta-publish'
import { metaRequestTag, type MetaPlanContent } from '@/lib/ads/meta-publish-plan'
import { describeMetaPublishError, type MetaPublishStep } from '@/lib/ads/meta-publish-errors'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const TOKEN = 'EAAGm0PX4ZCpsBAKsecrettoken1234567890'
const ACCOUNT = 'act_123456789'
const REQUEST_ID = '9b2f4c1e-7a3d-4e58-8c1b-2f6d9a0e5b71'
const TAG = metaRequestTag(REQUEST_ID)
const context = { userId: USER_ID, connectionId: '0b9c1a2e-1d3f-4a5b-9c7d-8e6f5a4b3c2d' }

const CONTENT: MetaPlanContent = {
  name: 'Yaz kampanyası',
  landingUrl: 'https://ornek.com/yaz',
  primaryText: 'Yaz indirimi başladı.',
  headline: 'Yaz fırsatları',
  description: 'Kaçırmayın',
  cta: 'LEARN_MORE',
  countries: ['TR'],
  ageMin: 18,
  ageMax: 65,
  advantageAudience: true,
  gender: 'all',
  dailyBudget: 100,
  optimizationGoal: 'LANDING_PAGE_VIEWS',
  utmTracking: true,
  endDate: null,
  imagePath: `${USER_ID}/0f1e2d3c-4b5a-4968-8776-655443322110.jpg`,
  specialTopic: 'none',
}

const IDS = {
  campaigns: '111111111111',
  adsets: '222222222222',
  adcreatives: '444444444444',
  ads: '555555555555',
  imageHash: 'abcdef1234567890abcd',
}

type Call = {
  method: string
  edge: string
  query: Record<string, string>
  form: Record<string, string>
  authorization: string | undefined
  url: string
}

type Handler = (call: Call, index: number) => Response | Error

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function graphError(code: number, status = 400, message = 'failure', extra: Record<string, unknown> = {}) {
  return json({ error: { message, type: 'OAuthException', code, fbtrace_id: 'trace', ...extra } }, status)
}

function defaultResponse(call: Call): Response {
  if (call.method === 'GET') return json({ data: [] })
  if (call.edge === 'adimages') return json({ images: { 'creative.jpg': { hash: IDS.imageHash } } })
  const id = IDS[call.edge as 'campaigns' | 'adsets' | 'adcreatives' | 'ads']
  return json({ id })
}

/** Fake Graph server behind the real API client: handlers are keyed `METHOD edge` and counted per key. */
function setup(handlers: Record<string, Handler> = {}) {
  const calls: Call[] = []
  const counts = new Map<string, number>()
  const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
    const method = String(init.method ?? 'GET')
    const edge = url.pathname.split('/').slice(3).join('/')
    const call: Call = {
      method,
      edge,
      query: Object.fromEntries(url.searchParams.entries()),
      form: typeof init.body === 'string' ? Object.fromEntries(new URLSearchParams(init.body).entries()) : {},
      authorization: (init.headers as Record<string, string>).Authorization,
      url: url.toString(),
    }
    calls.push(call)
    const key = `${method} ${edge}`
    const index = counts.get(key) ?? 0
    counts.set(key, index + 1)
    const result = (handlers[key] ?? defaultResponse)(call, index)
    if (result instanceof Error) throw result
    return result
  })
  const reservations: MetaQuotaReservation[] = []
  const reserveQuota = vi.fn(async (input: MetaQuotaReservation) => {
    reservations.push(input)
    return true
  })
  const recordOutcome = vi.fn(async () => undefined)
  const log = vi.fn()
  const graph = createMetaApiClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    reserveQuota,
    recordOutcome,
    sleep: async () => undefined,
    log,
    apiVersion: 'v24.0',
  })
  const posts = () => calls.filter((call) => call.method === 'POST')
  return { graph, calls, posts, fetchImpl, reserveQuota, reservations, recordOutcome, log }
}

function deps(graph: ReturnType<typeof setup>['graph'], over: Partial<Parameters<typeof publishPausedMetaCampaign>[0]> = {}) {
  const steps: Array<{ step: MetaPublishStep; id: string; source: string }> = []
  const base: Parameters<typeof publishPausedMetaCampaign>[0] = {
    graph,
    accessToken: TOKEN,
    context,
    accountId: ACCOUNT,
    apiVersion: 'v24.0',
    content: CONTENT,
    dailyBudgetMinor: 10_000,
    tag: TAG,
    pageId: '987654321012',
    instagramAccountId: null,
    loadImage: async () => ({ bytes: new Uint8Array([1, 2, 3]), filename: `${TAG}.jpg` }),
    objects: { ...EMPTY_OBJECTS },
    onStep: async (step, id, source) => {
      steps.push({ step, id, source })
    },
  }
  return { input: { ...base, ...over }, steps }
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('Kullanılabilir Meta hata yönlendirmeleri', () => {
  it('Sayfa/Instagram izin reddini aksiyon önerisi ve trace ayrıntısıyla açıklar', () => {
    const failure = describeMetaPublishError(new MetaAdsError('permission_missing', {
      code: 200,
      subcode: 1815010,
      type: 'OAuthException',
      message: 'No permission to advertise on this Page',
      userMessage: 'Instagram account is not authorized',
      traceId: 'AbCdEfTrace123',
      blameFields: ['page_id', 'instagram_user_id'],
    }), 'ad')

    expect(failure.code).toBe('page_required')
    expect(failure.message).toContain('Instagram')
    expect(failure.metaReason).toContain('error_subcode=1815010')
    expect(failure.metaReason).toContain('fbtrace_id=AbCdEfTrace123')
  })

  it('reklamveren doğrulama reddini ayrı kodla sınıflandırır', () => {
    const failure = describeMetaPublishError(new MetaAdsError('provider_error', {
      code: 100,
      subcode: null,
      type: 'OAuthException',
      message: 'Advertiser verification is required before running ads',
    }), 'ad')

    expect(failure.code).toBe('advertiser_verification_required')
    expect(failure.message).toContain('Hesap Kalitesi')
  })

  it('kampanya hesabı kısıtlamasını yayın ön kontrolüyle eşleştirir', () => {
    const failure = describeMetaPublishError(new MetaAdsError('provider_error', {
      code: 273,
      subcode: null,
      type: 'OAuthException',
      message: 'Ad account is disabled',
    }), 'ad')
    expect(failure.code).toBe('account_restricted')
  })
})

describe('Meta yayın sırası ve PAUSED', () => {
  it('kampanya -> reklam seti -> görsel -> kreatif -> reklam sırasıyla yazar ve nesne kimliklerini döndürür', async () => {
    const { graph, posts } = setup()
    const { input, steps } = deps(graph)
    const result = await publishPausedMetaCampaign(input)

    expect(result.ok).toBe(true)
    expect(posts().map((call) => call.edge)).toEqual(['campaigns', 'adsets', 'adimages', 'adcreatives', 'ads'])
    expect(steps.map((entry) => entry.step)).toEqual(['campaign', 'adset', 'image', 'creative', 'ad'])
    expect(steps.every((entry) => entry.source === 'created')).toBe(true)
    if (result.ok) {
      expect(result.objects).toEqual({
        campaignId: IDS.campaigns,
        adSetId: IDS.adsets,
        imageHash: IDS.imageHash,
        creativeId: IDS.adcreatives,
        adId: IDS.ads,
      })
    }
  })

  it('kampanya, reklam seti ve reklam status=PAUSED gönderir; hiçbir yazma isteği ACTIVE içermez', async () => {
    const { graph, posts } = setup()
    const { input } = deps(graph)
    await publishPausedMetaCampaign(input)

    const byEdge = Object.fromEntries(posts().map((call) => [call.edge, call.form]))
    expect(byEdge.campaigns.status).toBe('PAUSED')
    expect(byEdge.adsets.status).toBe('PAUSED')
    expect(byEdge.ads.status).toBe('PAUSED')
    for (const call of posts()) {
      expect(call.form.status === undefined || call.form.status === 'PAUSED').toBe(true)
      expect(Object.values(call.form).join(' ')).not.toContain('ACTIVE')
      expect(call.form.execution_options).toBeUndefined()
    }
    expect(byEdge.campaigns.special_ad_categories).toBe('[]')
  })

  it('her yazmadan önce aynı gloval-req etiketiyle GET araması yapılır ve etiket nesne adına eklenir', async () => {
    const { graph, calls, posts } = setup()
    const { input } = deps(graph)
    await publishPausedMetaCampaign(input)

    expect(TAG).toMatch(/^gloval-req-[0-9a-f]{12}$/)
    const firstCampaignPost = calls.findIndex((call) => call.method === 'POST' && call.edge === 'campaigns')
    const lookup = calls.slice(0, firstCampaignPost).find((call) => call.method === 'GET' && call.edge === 'campaigns')
    expect(lookup).toBeDefined()
    expect(lookup?.query).toMatchObject({ fields: 'id,name', limit: '100' })
    expect(lookup?.query).not.toHaveProperty('filtering')
    expect(posts().find((call) => call.edge === 'campaigns')?.form.name).toContain(TAG)
  })

  it('kayıtlı kampanya kimliği varsa yeniden oluşturmaz', async () => {
    const { graph, posts } = setup()
    const { input, steps } = deps(graph, { objects: { ...EMPTY_OBJECTS, campaignId: '999999999999' } })
    await publishPausedMetaCampaign(input)
    expect(posts().map((call) => call.edge)).not.toContain('campaigns')
    expect(steps[0]).toEqual({ step: 'campaign', id: '999999999999', source: 'reused' })
  })
})

describe('Yazma çağrılarında retry yok', () => {
  it('5xx yanıtında POST tek denemeyle biter ve sonuç belirsiz sayılır', async () => {
    const { graph, posts, fetchImpl } = setup({ 'POST campaigns': () => graphError(1, 500, 'server down') })
    const { input } = deps(graph)
    const result = await publishPausedMetaCampaign(input)

    expect(posts().filter((call) => call.edge === 'campaigns')).toHaveLength(1)
    expect(posts()).toHaveLength(1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.step).toBe('campaign')
      expect(result.failure.code).toBe('write_outcome_unknown')
      expect(result.objects.campaignId).toBeNull()
    }
    expect(fetchImpl.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
  })

  it('ağ hatasında POST tekrarlanmaz', async () => {
    const { graph, posts } = setup({ 'POST adsets': () => new TypeError('fetch failed') })
    const { input } = deps(graph)
    const result = await publishPausedMetaCampaign(input)

    expect(posts().filter((call) => call.edge === 'adsets')).toHaveLength(1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.code).toBe('write_outcome_unknown')
  })

  it('4xx (alan hatası) yanıtında da POST tek denemedir', async () => {
    const { graph, posts } = setup({ 'POST adsets': () => graphError(100, 400, 'Invalid parameter') })
    const { input } = deps(graph)
    await publishPausedMetaCampaign(input)
    expect(posts().filter((call) => call.edge === 'adsets')).toHaveLength(1)
  })

  it('aynı koşulda okuma (GET) çağrıları geçici hatada yeniden denenir', async () => {
    const { graph, calls } = setup({
      'GET campaigns': (_call, index) => (index === 0 ? graphError(1, 500, 'blip') : json({ data: [] })),
    })
    const found = await findObjectByTag({ graph, accessToken: TOKEN, context, accountId: ACCOUNT, apiVersion: 'v24.0' }, 'campaign', TAG)
    expect(found).toBeNull()
    expect(calls.filter((call) => call.method === 'GET' && call.edge === 'campaigns')).toHaveLength(2)
  })
})

describe('Zaman aşımı: sonuç belirsiz, etiketle aranıp çiftlenmeden kullanılır', () => {
  it('kampanya POST zaman aşımına uğrarsa mevcut nesne gloval-req etiketiyle bulunur ve ikinci kez oluşturulmaz', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    const { graph, calls, posts } = setup({
      'POST campaigns': () => timeout,
      'GET campaigns': (_call, index) =>
        index === 0 ? json({ data: [] }) : json({ data: [{ id: IDS.campaigns, name: `Yaz kampanyası [${TAG}]` }] }),
    })
    const { input, steps } = deps(graph)
    const result = await publishPausedMetaCampaign(input)

    expect(result.ok).toBe(true)
    expect(posts().filter((call) => call.edge === 'campaigns')).toHaveLength(1)
    expect(steps[0]).toEqual({ step: 'campaign', id: IDS.campaigns, source: 'found_by_tag' })
    const lookups = calls.filter((call) => call.method === 'GET' && call.edge === 'campaigns')
    expect(lookups).toHaveLength(2)
    expect(lookups.every((call) => !('filtering' in call.query))).toBe(true)
    expect(lookups[0]?.query.after).toBeUndefined()
    expect(lookups[1]?.query.after).toBeUndefined()
    expect(posts().map((call) => call.edge)).toEqual(['campaigns', 'adsets', 'adimages', 'adcreatives', 'ads'])
    if (result.ok) expect(result.objects.campaignId).toBe(IDS.campaigns)
  })

  it('zaman aşımından sonra nesne bulunamazsa belirsiz sonuç hatası döner ve ilerlenmez', async () => {
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    const { graph, posts } = setup({ 'POST adsets': () => timeout })
    const { input } = deps(graph)
    const result = await publishPausedMetaCampaign(input)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.step).toBe('adset')
      expect(result.failure.code).toBe('write_outcome_unknown')
      expect(result.objects.campaignId).toBe(IDS.campaigns)
    }
    expect(posts().map((call) => call.edge)).toEqual(['campaigns', 'adsets'])
  })

  it('önceki bir denemenin oluşturduğu nesne yazmadan önceki aramada bulunur (çiftlenmez)', async () => {
    const { graph, posts } = setup({
      'GET adsets': () => json({ data: [{ id: IDS.adsets, name: `Yaz kampanyası [${TAG}]` }] }),
    })
    const { input, steps } = deps(graph)
    await publishPausedMetaCampaign(input)
    expect(posts().map((call) => call.edge)).not.toContain('adsets')
    expect(steps.find((entry) => entry.step === 'adset')).toEqual({ step: 'adset', id: IDS.adsets, source: 'found_by_tag' })
  })

  it('etiketi son kayıtlarda istemci tarafında bulmak için sayfalar', async () => {
    const { graph, calls } = setup({
      'GET campaigns': (call, index) => index === 0
        ? json({ data: [], paging: { next: 'https://graph.facebook.com/next', cursors: { after: 'cursor-1' } } })
        : json({ data: [{ id: IDS.campaigns, name: `Yaz kampanyası [${TAG}]` }] }),
    })
    const found = await findObjectByTag({ graph, accessToken: TOKEN, context, accountId: ACCOUNT, apiVersion: 'v24.0' }, 'campaign', TAG)
    const lookups = calls.filter((call) => call.method === 'GET' && call.edge === 'campaigns')

    expect(found).toBe(IDS.campaigns)
    expect(lookups).toHaveLength(2)
    expect(lookups[1]?.query.after).toBe('cursor-1')
    expect(lookups.every((call) => !('filtering' in call.query))).toBe(true)
  })

  it('sayfalama aramasını üç istekle sınırlar', async () => {
    const { graph, calls } = setup({
      'GET campaigns': (_call, index) => json({
        data: [],
        paging: { next: 'https://graph.facebook.com/next', cursors: { after: `cursor-${index}` } },
      }),
    })
    const found = await findObjectByTag({ graph, accessToken: TOKEN, context, accountId: ACCOUNT, apiVersion: 'v24.0' }, 'campaign', TAG)

    expect(found).toBeNull()
    expect(calls.filter((call) => call.method === 'GET' && call.edge === 'campaigns')).toHaveLength(3)
  })

  it('farklı etikete ait nesne eşleşmez', async () => {
    const { graph } = setup({
      'GET campaigns': () => json({ data: [{ id: '777777777777', name: 'Başka [gloval-req-aaaaaaaaaaaa]' }] }),
    })
    const found = await findObjectByTag({ graph, accessToken: TOKEN, context, accountId: ACCOUNT, apiVersion: 'v24.0' }, 'campaign', TAG)
    expect(found).toBeNull()
  })
})

describe('Kısmi başarısızlık ve kaldığı yerden devam', () => {
  it('Meta yazma hatasında geri çağrıyla adımın güvenli hata bilgisini kaydeder', async () => {
    const { graph } = setup({
      'POST ads': () => graphError(200, 400, 'No permission to advertise on this Page', {
        error_subcode: 1815010,
        error_user_title: 'Page permissions are required',
        error_user_msg: 'Access denied for jane@example.com',
        fbtrace_id: 'AbCdEfTrace123',
      }),
    })
    const onWriteFailure = vi.fn<(step: Exclude<MetaPublishStep, 'preflight'>, error: MetaAdsError) => Promise<void>>(async () => undefined)
    const { input } = deps(graph, { onWriteFailure })
    const result = await publishPausedMetaCampaign(input)

    expect(result.ok).toBe(false)
    expect(onWriteFailure).toHaveBeenCalledTimes(1)
    expect(onWriteFailure.mock.calls[0]?.[0]).toBe('ad')
    expect(onWriteFailure.mock.calls[0]?.[1]).toMatchObject({
      endpoint: 'act.ads.create',
      detail: {
        code: 200,
        subcode: 1815010,
        type: 'OAuthException',
        traceId: 'AbCdEfTrace123',
        userTitle: 'Page permissions are required',
        userMessage: 'Access denied for [email]',
      },
    })
  })

  it('reklam seti reddedilince kampanya kimliği kaydedilir ve hata adımı adset olur', async () => {
    const { graph, posts } = setup({ 'POST adsets': () => graphError(100, 400, 'Invalid parameter', { error_data: { blame_field_specs: [['daily_budget']] } }) })
    const { input, steps } = deps(graph)
    const result = await publishPausedMetaCampaign(input)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.step).toBe('adset')
      expect(result.objects.campaignId).toBe(IDS.campaigns)
      expect(result.objects.adSetId).toBeNull()
      expect(result.failure.code).toBe('budget_too_low')
    }
    expect(steps.map((entry) => entry.step)).toEqual(['campaign'])
    expect(posts().map((call) => call.edge)).toEqual(['campaigns', 'adsets'])
  })

  it('ikinci denemede kayıtlı nesne kimliklerinden devam eder, onları yeniden oluşturmaz', async () => {
    const saved: MetaPublishObjects = { ...EMPTY_OBJECTS, campaignId: IDS.campaigns, adSetId: IDS.adsets }
    const { graph, posts } = setup()
    const { input, steps } = deps(graph, { objects: saved })
    const result = await publishPausedMetaCampaign(input)

    expect(result.ok).toBe(true)
    expect(posts().map((call) => call.edge)).toEqual(['adimages', 'adcreatives', 'ads'])
    expect(steps.map((entry) => `${entry.step}:${entry.source}`)).toEqual([
      'campaign:reused', 'adset:reused', 'image:created', 'creative:created', 'ad:created',
    ])
    expect(posts().find((call) => call.edge === 'ads')?.form.adset_id).toBe(IDS.adsets)
  })

  it('son adım (reklam) başarısızsa kampanya, set, görsel ve kreatif kimlikleri korunur', async () => {
    const { graph } = setup({ 'POST ads': () => graphError(100, 400, 'Invalid parameter') })
    const { input } = deps(graph)
    const result = await publishPausedMetaCampaign(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.step).toBe('ad')
      expect(result.objects).toEqual({
        campaignId: IDS.campaigns,
        adSetId: IDS.adsets,
        imageHash: IDS.imageHash,
        creativeId: IDS.adcreatives,
        adId: null,
      })
    }
  })

  it('görsel yalnızca görsel adımına gelindiğinde okunur', async () => {
    const loadImage = vi.fn(async () => ({ bytes: new Uint8Array([1]), filename: 'x.jpg' }))
    const { graph } = setup({ 'POST adsets': () => graphError(100, 400, 'Invalid parameter') })
    const { input } = deps(graph, { loadImage })
    await publishPausedMetaCampaign(input)
    expect(loadImage).not.toHaveBeenCalled()
  })
})

describe('validate_only yolu', () => {
  const common = (graph: ReturnType<typeof setup>['graph']) => ({
    graph, accessToken: TOKEN, context, accountId: ACCOUNT, apiVersion: 'v24.0',
    content: CONTENT, dailyBudgetMinor: 10_000, tag: TAG, hasInstagram: false,
  })

  it('yalnızca *.validate uçlarını çağırır, execution_options=validate_only gönderir, hiçbir nesne oluşturmaz', async () => {
    const { graph, posts, reservations } = setup({ 'POST campaigns': () => json({ success: true }) })
    const result = await validateMetaPlanRemote({ ...common(graph), objects: { ...EMPTY_OBJECTS } })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.checked).toEqual(['campaign'])
      expect(result.deferred).toEqual(expect.arrayContaining(['adset', 'ad', 'creative']))
    }
    expect(posts()).toHaveLength(1)
    expect(posts()[0].form.execution_options).toBe(JSON.stringify(['validate_only']))
    expect(reservations.map((entry) => entry.endpoint)).toEqual(['act.campaigns.validate'])
    expect(reservations.every((entry) => !entry.endpoint.endsWith('.create'))).toBe(true)
  })

  it('doğrulama çağrıları okuma değil yazma kotasından düşer', async () => {
    const { graph, reservations } = setup({ 'POST campaigns': () => json({ success: true }) })
    await validateMetaPlanRemote({ ...common(graph), objects: { ...EMPTY_OBJECTS } })

    expect(isMetaWriteEndpoint('act.campaigns.validate')).toBe(true)
    expect(isMetaWriteEndpoint('act.ads.validate')).toBe(true)
    expect(isMetaWriteEndpoint('act.funding')).toBe(false)
    const write = resolveMetaWriteDailyLimits()
    expect(reservations[0].userDailyLimit).toBe(write.perUser)
    expect(reservations[0].globalDailyLimit).toBe(write.global)
    expect(reservations[0].userDailyLimit).not.toBe(resolveMetaReadDailyLimits().perUser)
  })

  it('üst nesne kayıtlıysa reklam seti ve reklam da doğrulanır; yine de create çağrılmaz', async () => {
    const { graph, posts, reservations } = setup({
      'POST campaigns': () => json({ success: true }),
      'POST adsets': () => json({ success: true }),
      'POST ads': () => json({ success: true }),
    })
    const result = await validateMetaPlanRemote({
      ...common(graph),
      objects: { ...EMPTY_OBJECTS, campaignId: IDS.campaigns, adSetId: IDS.adsets, creativeId: IDS.adcreatives },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.checked).toEqual(['campaign', 'adset', 'ad'])
    expect(posts().every((call) => call.form.execution_options === JSON.stringify(['validate_only']))).toBe(true)
    expect(reservations.map((entry) => entry.endpoint)).toEqual(['act.campaigns.validate', 'act.adsets.validate', 'act.ads.validate'])
  })

  it('doğrulama zaman aşımında belirsiz sayılmaz ve nesne aranmaz (yazma yok)', async () => {
    const { graph, calls } = setup({ 'POST campaigns': () => new TypeError('fetch failed') })
    const result = await validateMetaPlanRemote({ ...common(graph), objects: { ...EMPTY_OBJECTS } })
    expect(result.ok).toBe(false)
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(0)
  })

  it('Meta alanı reddederse hata adımı ve alan adı Türkçe döner', async () => {
    const { graph } = setup({
      'POST campaigns': () => graphError(100, 400, 'Invalid parameter', { error_data: { blame_field_specs: [['name']] } }),
    })
    const result = await validateMetaPlanRemote({ ...common(graph), objects: { ...EMPTY_OBJECTS } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.step).toBe('campaign')
      expect(result.failure.blamedFields).toEqual(['ad'])
    }
  })
})

describe('Ödeme yöntemi ve hesap durumu ön kontrolü', () => {
  const common = (graph: ReturnType<typeof setup>['graph']) => ({
    graph, accessToken: TOKEN, context, accountId: ACCOUNT, apiVersion: 'v24.0',
  })

  it('hesap aktif ve ödeme yöntemi tanımlıysa devam eder, para birimini döndürür', async () => {
    const { graph, posts } = setup({
      'GET ': () => json({ account_status: 1, currency: 'TRY', funding_source: '123456789' }),
    })
    const result = await preflightMetaAccount(common(graph))
    expect(result).toEqual({ ok: true, currency: 'TRY' })
    expect(posts()).toHaveLength(0)
  })

  it('ödeme yöntemi yoksa payment_method_missing ile durur; hiçbir yazma yapılmaz', async () => {
    const { graph, posts } = setup({ 'GET ': () => json({ account_status: 1, currency: 'TRY', funding_source: null }) })
    const result = await preflightMetaAccount(common(graph))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.code).toBe('payment_method_missing')
      expect(result.failure.message).toContain('ödeme yöntemi')
    }
    expect(posts()).toHaveLength(0)
  })

  it('funding_source 0 ise de ödeme yöntemi eksik sayılır', async () => {
    const { graph } = setup({ 'GET ': () => json({ account_status: 1, funding_source: '0' }) })
    const result = await preflightMetaAccount(common(graph))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.code).toBe('payment_method_missing')
  })

  it.each([2, 3, 7, 9, 100])('hesap durumu %i (aktif değil) ise account_restricted ile durur', async (status) => {
    const { graph, posts } = setup({ 'GET ': () => json({ account_status: status, funding_source: '123456789' }) })
    const result = await preflightMetaAccount(common(graph))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.code).toBe('account_restricted')
    expect(posts()).toHaveLength(0)
  })

  it('ön kontrol okuması act.funding ucundan, okuma kotasıyla yapılır', async () => {
    const { graph, reservations } = setup({ 'GET ': () => json({ account_status: 1, funding_source: '1' }) })
    await preflightMetaAccount(common(graph))
    expect(reservations.map((entry) => entry.endpoint)).toEqual(['act.funding'])
  })

  it('ön kontrol sırasında Meta hatası (izin eksik) yazmadan güvenli koda çevrilir', async () => {
    const { graph, posts } = setup({ 'GET ': () => graphError(200, 403, 'Permissions error') })
    const result = await preflightMetaAccount(common(graph))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.code).toBe('publish_permission_missing')
    expect(posts()).toHaveLength(0)
  })
})

describe('Token sızıntısı yok', () => {
  it('token yalnızca Authorization başlığında; URL, form gövdesi ve kota kayıtlarında geçmez', async () => {
    const { graph, calls, reservations, recordOutcome } = setup()
    const { input } = deps(graph)
    await publishPausedMetaCampaign(input)

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.authorization).toBe(`Bearer ${TOKEN}`)
      expect(call.url).not.toContain(TOKEN)
      expect(call.url).not.toContain('access_token')
      expect(JSON.stringify(call.query)).not.toContain(TOKEN)
      expect(JSON.stringify(call.form)).not.toContain(TOKEN)
    }
    expect(JSON.stringify(reservations)).not.toContain(TOKEN)
    expect(JSON.stringify(recordOutcome.mock.calls)).not.toContain(TOKEN)
  })

  it('Meta hata iletisi token içerse bile log, hata ayrıntısı ve kullanıcı mesajında geçmez', async () => {
    const leaky = `Invalid OAuth access token. access_token=${TOKEN} Bearer ${TOKEN} sahibi kisi@ornek.com`
    const { graph, log, recordOutcome } = setup({
      'POST campaigns': () => graphError(100, 400, leaky, { error_user_msg: `Token ${TOKEN} geçersiz` }),
    })
    const { input } = deps(graph)
    const result = await publishPausedMetaCampaign(input)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain(TOKEN)
      expect(serialized).not.toContain('kisi@ornek.com')
      expect(result.failure.metaReason ?? '').not.toContain(TOKEN)
      expect(result.failure.message).not.toContain(TOKEN)
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(recordOutcome.mock.calls)).not.toContain(TOKEN)
  })

  it('MetaAdsError.detail ham gövde veya token taşımaz, fbtrace_id saklar', async () => {
    const { graph } = setup({
      'GET ': () => graphError(100, 400, `access_token=${TOKEN}`, { fbtrace_id: 'ABCtrace123' }),
    })
    let caught: unknown
    try {
      await graph.request({ endpoint: 'act.funding', path: `/${ACCOUNT}`, accessToken: TOKEN, context })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(MetaAdsError)
    const serialized = JSON.stringify((caught as MetaAdsError).detail)
    expect(serialized).not.toContain(TOKEN)
    expect(serialized).toContain('ABCtrace123')
    expect(String((caught as MetaAdsError).message)).not.toContain(TOKEN)
  })
})
