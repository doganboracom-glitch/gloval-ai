import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const PLAN_ID = '0b9c1a2e-1d3f-4a5b-9c7d-8e6f5a4b3c2d'
const CONNECTION_ID = '3c2d1e0f-9a8b-4c7d-8e6f-5a4b3c2d1e0f'
const REQUEST_ID = '9b2f4c1e-7a3d-4e58-8c1b-2f6d9a0e5b71'
const ACTION_ID = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d'
const TOKEN = 'EAAGm0PX4ZCpsBAKsecrettoken1234567890'
const ACCOUNT = 'act_123456789'
const IMAGE_SHA = 'a'.repeat(64)

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  checkRateLimit: vi.fn(),
  getMetaPlan: vi.fn(),
  saveMetaPlanObject: vi.fn(),
  appendMetaAction: vi.fn(),
  getMetaConnectionForUser: vi.fn(),
  logUserEvent: vi.fn(),
  rpcResults: {} as Record<string, { data: unknown; error: unknown }>,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  fetchImpl: vi.fn(),
  connection: {} as Record<string, unknown>,
}))

vi.mock('@/lib/supabase/request-user', () => ({
  getRequestUser: mocks.getRequestUser,
  AuthUnavailableError: class AuthUnavailableError extends Error {},
}))
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock('@/lib/notify', () => ({ logUserEvent: mocks.logUserEvent }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      mocks.rpcCalls.push({ name, args })
      const result = mocks.rpcResults[name] ?? { data: null, error: null }
      return Object.assign(Promise.resolve(result), { maybeSingle: () => Promise.resolve(result) })
    },
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(3) }, error: null }),
      }),
    },
  }),
}))
vi.mock('@/lib/ads/meta-plans-store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ads/meta-plans-store')>('@/lib/ads/meta-plans-store')
  return {
    ...actual,
    getMetaPlan: mocks.getMetaPlan,
    saveMetaPlanObject: mocks.saveMetaPlanObject,
    appendMetaAction: mocks.appendMetaAction,
  }
})
vi.mock('@/lib/ads/meta-connections', () => ({
  getMetaConnectionForUser: mocks.getMetaConnectionForUser,
  withMetaAccess: async (input: { action: (data: unknown) => Promise<unknown> }) =>
    input.action({
      connection: mocks.connection,
      accessToken: TOKEN,
      context: { userId: USER_ID, connectionId: CONNECTION_ID },
    }),
}))
vi.mock('@/lib/ads/meta-api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ads/meta-api-client')>('@/lib/ads/meta-api-client')
  return {
    ...actual,
    createMetaApiClient: () =>
      actual.createMetaApiClient({
        fetchImpl: mocks.fetchImpl as unknown as typeof fetch,
        reserveQuota: async () => true,
        recordOutcome: async () => undefined,
        sleep: async () => undefined,
        log: () => undefined,
        apiVersion: 'v24.0',
      }),
  }
})

import { POST as publishPost } from '@/app/api/ads/meta/plans/publish/route'
import { POST as approvalPost } from '@/app/api/ads/meta/plans/approval/route'
import { META_PUBLISH_SCOPES } from '@/lib/ads/meta-ads-shared'
import { metaPlanHash, metaRequestTag, type MetaPlanContent } from '@/lib/ads/meta-publish-plan'

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

function planRow(over: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    user_id: USER_ID,
    connection_id: CONNECTION_ID,
    status: 'approved',
    content: CONTENT,
    version: 3,
    currency: 'TRY',
    daily_budget_minor: 10_000,
    request_id: REQUEST_ID,
    image_sha256: IMAGE_SHA,
    plan_hash: metaPlanHash(CONTENT, { connectionId: CONNECTION_ID, currency: 'TRY', imageSha: IMAGE_SHA }),
    approved_version: 3,
    approved_at: '2026-01-01T00:00:00Z',
    approval_summary: null,
    validated_version: 3,
    validated_at: '2026-01-01T00:00:00Z',
    meta_campaign_id: null,
    meta_adset_id: null,
    meta_image_hash: null,
    meta_creative_id: null,
    meta_ad_id: null,
    failure_step: null,
    failure_code: null,
    failure_reason: null,
    published_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function connectionRow(over: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    user_id: USER_ID,
    platform: 'meta',
    external_account_id: ACCOUNT,
    external_account_name: 'Hesabım',
    currency_code: 'TRY',
    status: 'active',
    scopes: [...META_PUBLISH_SCOPES],
    page_id: '987654321012',
    page_name: 'Sayfam',
    instagram_account_id: null,
    instagram_account_name: null,
    ...over,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type GraphHandler = (method: string, edge: string, index: number) => Response | Error | undefined

/** Healthy Graph by default; `override` can answer a given call differently (return undefined to fall through). */
function installGraph(override: GraphHandler = () => undefined) {
  const calls: Array<{ method: string; edge: string; authorization: string | undefined; url: string }> = []
  const counts = new Map<string, number>()
  mocks.fetchImpl.mockImplementation(async (url: URL, init: RequestInit) => {
    const method = String(init.method ?? 'GET')
    const edge = url.pathname.split('/').slice(3).join('/')
    calls.push({ method, edge, authorization: (init.headers as Record<string, string>).Authorization, url: url.toString() })
    const key = `${method} ${edge}`
    const index = counts.get(key) ?? 0
    counts.set(key, index + 1)
    const custom = override(method, edge, index)
    if (custom instanceof Error) throw custom
    if (custom) return custom
    if (method === 'GET' && edge === '') return json({ account_status: 1, currency: 'TRY', funding_source: '123456789' })
    if (method === 'GET' && edge === 'accounts') return json({ data: [{ id: '987654321012', tasks: ['ADVERTISE', 'MANAGE'] }] })
    if (method === 'GET') return json({ data: [] })
    if (edge === 'adimages') return json({ images: { 'creative.jpg': { hash: 'abcdef1234567890abcd' } } })
    const ids: Record<string, string> = { campaigns: '111111111111', adsets: '222222222222', adcreatives: '444444444444', ads: '555555555555' }
    return json({ id: ids[edge] })
  })
  return { calls, posts: () => calls.filter((call) => call.method === 'POST') }
}

function post(path: string, body: unknown, headers: Record<string, string> = { origin: 'https://gloval.ai' }) {
  return new Request(`https://gloval.ai/api/ads/meta/plans/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const publishBody = { planId: PLAN_ID, requestId: REQUEST_ID }
const finishCalls = () => mocks.rpcCalls.filter((call) => call.name === 'ads_finish_meta_publish_v2')

function stubEnvOpen() {
  vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
  vi.stubEnv('META_ADS_ACCESS_MODE', 'open')
  vi.stubEnv('META_ADS_PUBLISH_ENABLED', '1')
  vi.stubEnv('META_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
  vi.stubEnv('META_ADS_KILL_SWITCH', '')
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.rpcCalls.length = 0
  for (const key of Object.keys(mocks.rpcResults)) delete mocks.rpcResults[key]
  mocks.rpcResults.ads_reserve_meta_publish_credits = { data: [{ state: 'reserved', action_id: ACTION_ID, balance: 85 }], error: null }
  mocks.rpcResults.ads_finish_meta_publish_v2 = { data: [{ state: 'ok', credit_state: 'none', balance: 85, charged_amount: 0 }], error: null }
  mocks.connection = connectionRow()
  mocks.getRequestUser.mockResolvedValue({
    kind: 'authenticated',
    user: { id: USER_ID, email: 'kullanici@ornek.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
  })
  mocks.checkRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
  mocks.getMetaPlan.mockResolvedValue(planRow())
  mocks.getMetaConnectionForUser.mockResolvedValue(connectionRow())
  mocks.saveMetaPlanObject.mockResolvedValue(undefined)
  mocks.appendMetaAction.mockResolvedValue(undefined)
  mocks.logUserEvent.mockResolvedValue(true)
  stubEnvOpen()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/ads/meta/plans/publish: erişim kapıları', () => {
  it('özellik kapalıysa 404, Graph çağrılmaz', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '0')
    installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect(response.status).toBe(404)
    expect(mocks.fetchImpl).not.toHaveBeenCalled()
  })

  it('aynı kaynaktan gelmeyen istek 403 csrf_failed', async () => {
    installGraph()
    const response = await publishPost(post('publish', publishBody, { origin: 'https://kotu.example' }))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('csrf_failed')
    expect(mocks.fetchImpl).not.toHaveBeenCalled()
  })

  it('oturumsuz istek 401', async () => {
    mocks.getRequestUser.mockResolvedValue({ kind: 'anonymous' })
    installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect(response.status).toBe(401)
  })

  it('yayın izin listesinde olmayan kullanıcı 403 publish_not_allowed', async () => {
    vi.stubEnv('META_ADS_PUBLISH_ALLOWED_USER_IDS', '11111111-1111-4111-8111-111111111111')
    installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('publish_not_allowed')
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('yayın bayrağı kapalıysa yazma yok (publish_not_allowed)', async () => {
    vi.stubEnv('META_ADS_PUBLISH_ENABLED', '0')
    installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect(response.status).toBe(403)
    expect(mocks.fetchImpl).not.toHaveBeenCalled()
  })

  it('kill switch açıkken 503', async () => {
    vi.stubEnv('META_ADS_KILL_SWITCH', '1')
    installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('kill_switch_active')
    expect(mocks.fetchImpl).not.toHaveBeenCalled()
  })

  it('hız sınırı aşılınca 429', async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 1000 })
    installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect(response.status).toBe(429)
    expect(mocks.fetchImpl).not.toHaveBeenCalled()
  })

  it('geçersiz gövde 400 invalid_request', async () => {
    installGraph()
    const response = await publishPost(post('publish', { planId: 'x', requestId: REQUEST_ID }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('invalid_request')
  })
})

describe('POST /api/ads/meta/plans/publish: plan koruması', () => {
  it.each([
    ['taslak durumu', { status: 'draft' }],
    ['onaylı sürüm farklı', { approved_version: 2 }],
    ['plan özeti yok', { plan_hash: null }],
  ])('onaylanmamış plan (%s) yayınlanmaz ve Meta\'ya yazılmaz', async (_label, over) => {
    mocks.getMetaPlan.mockResolvedValue(planRow(over))
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('plan_not_approved')
    expect(graph.calls).toHaveLength(0)
    expect(mocks.rpcCalls.filter((call) => call.name === 'ads_reserve_meta_publish_credits')).toHaveLength(0)
  })

  it('plan bulunamazsa plan_not_found', async () => {
    mocks.getMetaPlan.mockResolvedValue(null)
    installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).error).toBe('plan_not_found')
  })

  it('yayın sürüyorsa publish_in_progress', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status: 'publishing' }))
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).error).toBe('publish_in_progress')
    expect(graph.calls).toHaveLength(0)
  })

  it('zaten yayınlanmış plan tekrar yazılmaz', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status: 'published', meta_ad_id: '555555555555' }))
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()
    expect(body).toMatchObject({ ok: true, alreadyPublished: true })
    expect(graph.calls).toHaveLength(0)
    // Only the idempotent charge retry may run; no capacity reservation or finish happens for a published plan.
    expect(mocks.rpcCalls.map((call) => call.name)).toEqual(['ads_settle_meta_publish_credit'])
  })

  it('onaydan sonra içerik değişirse (plan özeti uyuşmaz) plan_changed ve yazma yok', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ content: { ...CONTENT, headline: 'Sonradan değişti' } }))
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).error).toBe('plan_changed')
    expect(graph.posts()).toHaveLength(0)
  })

  it('para birimi bağlantıyla uyuşmuyorsa plan_changed', async () => {
    mocks.connection = connectionRow({ currency_code: 'USD' })
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).error).toBe('plan_changed')
    expect(graph.posts()).toHaveLength(0)
  })

  it('yayın kapasitesi dolduysa publish_quota_exceeded ve Graph çağrılmaz', async () => {
    mocks.rpcResults.ads_reserve_meta_publish_credits = { data: [{ state: 'user_publish_limit_reached' }], error: null }
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).error).toBe('publish_quota_exceeded')
    expect(graph.calls).toHaveLength(0)
  })

  it('yazma izni veya sayfa eksikse yayın başlamaz', async () => {
    mocks.connection = connectionRow({ scopes: ['ads_read'] })
    let graph = installGraph()
    let response = await publishPost(post('publish', publishBody))
    expect((await response.json()).error).toBe('publish_permission_missing')
    expect(graph.calls).toHaveLength(0)

    mocks.connection = connectionRow({ page_id: null })
    graph = installGraph()
    response = await publishPost(post('publish', publishBody))
    expect((await response.json()).error).toBe('page_required')
    expect(graph.calls).toHaveLength(0)
  })
})

describe('POST /api/ads/meta/plans/publish: ön kontrol', () => {
  it('ödeme yöntemi yoksa 422, adım preflight, hiçbir yazma yok ve sonuç failed', async () => {
    const graph = installGraph((method, edge) =>
      method === 'GET' && edge === '' ? json({ account_status: 1, currency: 'TRY', funding_source: null }) : undefined)
    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ ok: false, error: 'payment_method_missing', step: 'preflight', partial: false })
    expect(graph.posts()).toHaveLength(0)
    expect(finishCalls()).toHaveLength(1)
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'failed', p_failure_step: 'preflight', p_failure_code: 'payment_method_missing', p_campaign_id: null })
    expect(mocks.logUserEvent.mock.calls[0][0]).toMatchObject({ type: 'meta_ads_publish_failed' })
  })

  it('hesap kısıtlıysa (account_status != 1) account_restricted ile durur', async () => {
    const graph = installGraph((method, edge) =>
      method === 'GET' && edge === '' ? json({ account_status: 2, currency: 'TRY', funding_source: '1' }) : undefined)
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).error).toBe('account_restricted')
    expect(graph.posts()).toHaveLength(0)
  })

  it('seçilen Sayfa için reklam yetkisi yoksa hiçbir Meta yazması başlamaz', async () => {
    const graph = installGraph((method, edge) =>
      method === 'GET' && edge === 'accounts' ? json({ data: [{ id: '987654321012', tasks: ['ANALYZE'] }] }) : undefined)
    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ error: 'page_required', step: 'preflight' })
    expect(body.message).toContain('ADVERTISE')
    expect(graph.posts()).toHaveLength(0)
  })

  it('Instagram hesabı reklam hesabında erişilebilir değilse ön kontrolde durur', async () => {
    mocks.connection = connectionRow({ instagram_account_id: '17841400000000001' })
    const graph = installGraph((method, edge) =>
      method === 'GET' && edge === 'instagram_accounts' ? json({ data: [] }) : undefined)
    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ error: 'page_required', step: 'preflight' })
    expect(body.message).toContain('Instagram')
    expect(graph.posts()).toHaveLength(0)
  })
})

describe('POST /api/ads/meta/plans/publish: Meta hata denetimi', () => {
  it('başarısız Graph yazmasını maskeli hata ayrıntısıyla denetim kaydına ve plana yazar', async () => {
    const graph = installGraph((method, edge) => method === 'POST' && edge === 'campaigns'
      ? json({
          error: {
            code: 200,
            error_subcode: 1815010,
            type: 'OAuthException',
            message: 'No permission to advertise on this Page',
            error_user_title: 'Page permissions are required',
            error_user_msg: 'Access denied for jane@example.com',
            fbtrace_id: 'AbCdEfTrace123',
          },
        }, 403)
      : undefined)

    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()
    const auditAction = mocks.appendMetaAction.mock.calls.find((call) => call[1]?.status === 'failed')?.[1]

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ ok: false, error: 'page_required', step: 'campaign', partial: false })
    expect(body.metaReason).toContain('code=200')
    expect(body.metaReason).toContain('error_subcode=1815010')
    expect(body.metaReason).toContain('fbtrace_id=AbCdEfTrace123')
    expect(auditAction).toMatchObject({
      actionType: 'meta_publish_campaign',
      target: { endpoint: 'act.campaigns.create' },
      status: 'failed',
      afterState: {
        meta_error: {
          endpoint: 'act.campaigns.create',
          code: 200,
          subcode: 1815010,
          type: 'OAuthException',
          fbtrace_id: 'AbCdEfTrace123',
          error_user_title: 'Page permissions are required',
          error_user_msg: 'Access denied for [email]',
          message: 'No permission to advertise on this Page',
        },
      },
    })
    expect(JSON.stringify(auditAction)).not.toContain('jane@example.com')
    expect(JSON.stringify(auditAction)).not.toContain(TOKEN)
    expect(finishCalls()[0].args.p_failure_reason).toContain('fbtrace_id: AbCdEfTrace123')
    expect(finishCalls()[0].args.p_failure_reason).toContain('Uç nokta: act.campaigns.create')
    expect(graph.posts().map((call) => call.edge)).toEqual(['campaigns'])
  })
})

describe('POST /api/ads/meta/plans/publish: başarılı yayın', () => {
  it('beş nesneyi sırayla PAUSED yazar, kimlikleri kaydeder, published bitirir ve e-posta gönderir', async () => {
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(graph.posts().map((call) => call.edge)).toEqual(['campaigns', 'adsets', 'adimages', 'adcreatives', 'ads'])
    expect(mocks.saveMetaPlanObject.mock.calls.map((call) => call[2])).toEqual([
      'meta_campaign_id', 'meta_adset_id', 'meta_image_hash', 'meta_creative_id', 'meta_ad_id',
    ])
    expect(finishCalls()).toHaveLength(1)
    expect(finishCalls()[0].args).toMatchObject({
      p_outcome: 'published',
      p_campaign_id: '111111111111',
      p_adset_id: '222222222222',
      p_image_hash: 'abcdef1234567890abcd',
      p_creative_id: '444444444444',
      p_ad_id: '555555555555',
      p_failure_step: null,
    })
    const mail = mocks.logUserEvent.mock.calls[0][0]
    expect(mail).toMatchObject({ userId: USER_ID, type: 'meta_ads_publish_published', dedupeKey: `meta_ads_publish_published_${REQUEST_ID}` })
    const email = mail.userEmail({ emailLocale: 'tr', billingProfileIncomplete: false })
    expect(email.html).toContain('adsmanager')
    expect(email.html).toContain('act=123456789')
  })

  it('kayıtlı nesne kimlikleriyle devam eder; kampanya ve set yeniden oluşturulmaz', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status: 'partial', meta_campaign_id: '111111111111', meta_adset_id: '222222222222' }))
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).ok).toBe(true)
    expect(graph.posts().map((call) => call.edge)).toEqual(['adimages', 'adcreatives', 'ads'])
    // Önceden oluşmuş adımlar yeniden kaydedilmez ve ads_meta_actions'a çift satır yazılmaz; yalnızca yeni adımlar kaydedilir.
    expect(mocks.saveMetaPlanObject.mock.calls.map((call) => call[2])).toEqual(['meta_image_hash', 'meta_creative_id', 'meta_ad_id'])
    const actions = mocks.appendMetaAction.mock.calls.map((call) => call[1] as { actionType: string; target: { source: string } })
    expect(actions.map((action) => action.actionType)).toEqual(['meta_publish_image', 'meta_publish_creative', 'meta_publish_ad'])
    expect(actions.every((action) => action.target.source === 'created')).toBe(true)
  })

  it('tüm nesneler önceden oluşmuşsa hiçbir kayıt ve denetim satırı eklenmez, Meta\'ya yazılmaz', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({
      status: 'partial',
      meta_campaign_id: '111111111111',
      meta_adset_id: '222222222222',
      meta_image_hash: 'abcdef1234567890abcd',
      meta_creative_id: '444444444444',
      meta_ad_id: '555555555555',
    }))
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).ok).toBe(true)
    expect(graph.posts()).toHaveLength(0)
    expect(mocks.saveMetaPlanObject).not.toHaveBeenCalled()
    expect(mocks.appendMetaAction).not.toHaveBeenCalled()
  })

  it('e-posta gönderimi hata verse bile yayın sonucu değişmez', async () => {
    mocks.logUserEvent.mockRejectedValue(new Error('smtp down'))
    installGraph()
    const response = await publishPost(post('publish', publishBody))
    expect(response.status).toBe(200)
    expect((await response.json()).ok).toBe(true)
  })

  it('yanıt, kayıt ve çağrılarda erişim tokenı yalnızca Authorization başlığındadır', async () => {
    const graph = installGraph()
    const response = await publishPost(post('publish', publishBody))
    const text = await response.text()
    expect(text).not.toContain(TOKEN)
    expect(JSON.stringify(mocks.rpcCalls)).not.toContain(TOKEN)
    expect(JSON.stringify(mocks.appendMetaAction.mock.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(mocks.logUserEvent.mock.calls)).not.toContain(TOKEN)
    for (const call of graph.calls) {
      expect(call.url).not.toContain(TOKEN)
      expect(call.authorization).toBe(`Bearer ${TOKEN}`)
    }
  })
})

describe('POST /api/ads/meta/plans/publish: kısmi ve belirsiz sonuçlar', () => {
  it('reklam seti reddedilirse plan partial biter, kampanya kimliği korunur, 422 partial=true', async () => {
    const graph = installGraph((method, edge) =>
      method === 'POST' && edge === 'adsets'
        ? json({ error: { message: 'Invalid parameter', type: 'OAuthException', code: 100, error_data: { blame_field_specs: [['daily_budget']] } } }, 400)
        : undefined)
    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({ ok: false, step: 'adset', partial: true, error: 'budget_too_low' })
    expect(graph.posts().map((call) => call.edge)).toEqual(['campaigns', 'adsets'])
    expect(finishCalls()[0].args).toMatchObject({
      p_outcome: 'partial', p_campaign_id: '111111111111', p_adset_id: null, p_failure_step: 'adset', p_failure_code: 'budget_too_low',
    })
    expect(mocks.logUserEvent.mock.calls[0][0]).toMatchObject({ type: 'meta_ads_publish_partial' })
    expect(JSON.stringify(body)).not.toContain(TOKEN)
  })

  it('kampanya oluşturulamazsa failed biter ve nesne kimliği yazılmaz', async () => {
    installGraph((method, edge) =>
      method === 'POST' && edge === 'campaigns'
        ? json({ error: { message: 'Invalid parameter', type: 'OAuthException', code: 100 } }, 400)
        : undefined)
    const response = await publishPost(post('publish', publishBody))
    const body = await response.json()
    expect(body).toMatchObject({ ok: false, step: 'campaign', partial: false })
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'failed', p_campaign_id: null })
    expect(mocks.saveMetaPlanObject).not.toHaveBeenCalled()
  })

  it('kampanya POST zaman aşımında etiketle bulunur: tek POST, sonuç published, çiftlenme yok', async () => {
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    const tag = metaRequestTag(REQUEST_ID)
    const graph = installGraph((method, edge, index) => {
      if (method === 'POST' && edge === 'campaigns') return timeout
      if (method === 'GET' && edge === 'campaigns' && index >= 1) {
        return json({ data: [{ id: '111111111111', name: `Yaz kampanyası [${tag}]` }] })
      }
      return undefined
    })
    const response = await publishPost(post('publish', publishBody))
    expect((await response.json()).ok).toBe(true)
    expect(graph.posts().filter((call) => call.edge === 'campaigns')).toHaveLength(1)
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'published', p_campaign_id: '111111111111' })
  })

  it('beklenmeyen 5xx yazma hatasında POST tekrarlanmaz', async () => {
    const graph = installGraph((method, edge) =>
      method === 'POST' && edge === 'campaigns'
        ? json({ error: { message: 'boom', type: 'OAuthException', code: 2 } }, 500)
        : undefined)
    await publishPost(post('publish', publishBody))
    expect(graph.posts()).toHaveLength(1)
  })
})

describe('POST /api/ads/meta/plans/approval', () => {
  const approvalBody = { planId: PLAN_ID, expectedVersion: 3, termsAccepted: true }

  beforeEach(() => {
    mocks.rpcResults.ads_approve_meta_plan = { data: { state: 'approved', approval_id: ACTION_ID, plan_version: 3 }, error: null }
  })

  it('şartlar kabul edilmeden onay verilmez', async () => {
    const response = await approvalPost(post('approval', { ...approvalBody, termsAccepted: false }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('terms_not_accepted')
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('beklenen sürüm güncel değilse plan_changed', async () => {
    const response = await approvalPost(post('approval', { ...approvalBody, expectedVersion: 2 }))
    expect((await response.json()).error).toBe('plan_changed')
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('doğrulanmamış plan 409 validation_required', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ validated_version: 2 }))
    const response = await approvalPost(post('approval', approvalBody))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('validation_required')
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('görseli olmayan plan onaylanmaz', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ image_sha256: null }))
    const response = await approvalPost(post('approval', approvalBody))
    expect((await response.json()).error).toBe('image_invalid')
  })

  it('başarılı onay: plan özeti RPC\'ye yazılır, durum PAUSED olarak beyan edilir', async () => {
    const response = await approvalPost(post('approval', approvalBody))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.summary.status).toBe('PAUSED')
    const call = mocks.rpcCalls.find((entry) => entry.name === 'ads_approve_meta_plan')
    expect(call?.args).toMatchObject({
      p_user_id: USER_ID,
      p_plan_id: PLAN_ID,
      p_expected_version: 3,
      p_connection_id: CONNECTION_ID,
      p_plan_hash: metaPlanHash(CONTENT, { connectionId: CONNECTION_ID, currency: 'TRY', imageSha: IMAGE_SHA }),
    })
  })

  it('RPC planın değiştiğini bildirirse 409', async () => {
    mocks.rpcResults.ads_approve_meta_plan = { data: { state: 'plan_changed' }, error: null }
    const response = await approvalPost(post('approval', approvalBody))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('plan_changed')
  })

  it('bağlantı eksik izin veya sayfa nedeniyle yayınlanamazsa onay verilmez', async () => {
    mocks.getMetaConnectionForUser.mockResolvedValue(connectionRow({ scopes: [] }))
    let response = await approvalPost(post('approval', approvalBody))
    expect((await response.json()).error).toBe('publish_permission_missing')

    mocks.getMetaConnectionForUser.mockResolvedValue(connectionRow({ page_id: null }))
    response = await approvalPost(post('approval', approvalBody))
    expect((await response.json()).error).toBe('page_required')
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('erişim kapıları approval için de geçerli: kill switch 503, yayın izni yoksa 403', async () => {
    vi.stubEnv('META_ADS_KILL_SWITCH', '1')
    expect((await approvalPost(post('approval', approvalBody))).status).toBe(503)
    vi.stubEnv('META_ADS_KILL_SWITCH', '')
    vi.stubEnv('META_ADS_PUBLISH_ALLOWED_USER_IDS', '')
    expect((await approvalPost(post('approval', approvalBody))).status).toBe(403)
  })
})
