import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '0b9c1a2e-1d3f-4a5b-9c7d-8e6f5a4b3c2d'
const CONNECTION_ID = '3c2d1e0f-9a8b-4c7d-8e6f-5a4b3c2d1e0f'
const REQUEST_ID = '9b2f4c1e-7a3d-4e58-8c1b-2f6d9a0e5b71'
const REQUEST_ID_2 = '8a1e3b0d-6f2c-4d47-9b0a-1e5c8f9d4a60'
const ACTION_ID = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d'
const TOKEN = 'EAAGm0PX4ZCpsBAKsecrettoken1234567890'
const ACCOUNT = 'act_123456789'
const IDS = { campaign: '111111111111', adset: '222222222222', ad: '555555555555' }

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  checkRateLimit: vi.fn(),
  getMetaPlan: vi.fn(),
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
  }),
}))
vi.mock('@/lib/ads/meta-plans-store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ads/meta-plans-store')>('@/lib/ads/meta-plans-store')
  return { ...actual, getMetaPlan: mocks.getMetaPlan }
})
vi.mock('@/lib/ads/meta-connections', () => ({
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

import { POST as managePost } from '@/app/api/ads/meta/plans/manage/route'
import { POST as syncPost } from '@/app/api/ads/meta/plans/sync/route'
import { META_PUBLISH_SCOPES } from '@/lib/ads/meta-ads-shared'
import { META_MANAGE_TERMS_VERSION } from '@/lib/ads/meta-manage-ux'

type Remote = { account: Record<string, unknown>; campaign: Record<string, unknown>; adset: Record<string, unknown>; ad: Record<string, unknown> }
type Call = { method: string; id: string; form: Record<string, string>; authorization: string | undefined; url: string }
type GraphHandler = (call: Call, index: number) => Response | Error | undefined

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function freshRemote(over: { campaign?: string; adset?: string; ad?: string; budget?: string } = {}): Remote {
  const object = (status: string) => ({ status, effective_status: status })
  return {
    account: { account_status: 1, currency: 'TRY', funding_source: '123456789' },
    campaign: { id: IDS.campaign, ...object(over.campaign ?? 'PAUSED') },
    adset: { id: IDS.adset, ...object(over.adset ?? 'PAUSED'), daily_budget: over.budget ?? '10000' },
    ad: { id: IDS.ad, ...object(over.ad ?? 'PAUSED') },
  }
}

/** Stateful fake Graph: POSTs mutate the remote so read-backs and the final live read see the write. */
function installGraph(remote: Remote = freshRemote(), override: GraphHandler = () => undefined) {
  const calls: Call[] = []
  const counts = new Map<string, number>()
  mocks.fetchImpl.mockImplementation(async (url: URL, init: RequestInit) => {
    const method = String(init.method ?? 'GET')
    const id = url.pathname.split('/').slice(2).join('/')
    const form = Object.fromEntries(new URLSearchParams(String(init.body ?? '')))
    const call: Call = { method, id, form, authorization: (init.headers as Record<string, string>).Authorization, url: url.toString() }
    calls.push(call)
    const key = `${method} ${id}`
    const index = counts.get(key) ?? 0
    counts.set(key, index + 1)
    const custom = override(call, index)
    if (custom instanceof Error) throw custom
    if (custom) return custom
    if (id.endsWith('/insights')) return json({ data: [{ spend: '5', impressions: '100' }] })
    const target = id === ACCOUNT ? remote.account
      : id === IDS.campaign ? remote.campaign
        : id === IDS.adset ? remote.adset
          : id === IDS.ad ? remote.ad
            : null
    if (!target) return json({ error: { message: 'Unsupported get request', code: 100 } }, 400)
    if (method === 'POST') {
      Object.assign(target, form)
      if (form.status) target.effective_status = form.status
      return json({ success: true })
    }
    return json(target)
  })
  return { calls, remote, posts: () => calls.filter((call) => call.method === 'POST') }
}

function planRow(over: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    user_id: USER_ID,
    connection_id: CONNECTION_ID,
    status: 'published',
    content: { name: 'Yaz kampanyası', dailyBudget: 100 },
    version: 3,
    currency: 'TRY',
    daily_budget_minor: 10_000,
    request_id: REQUEST_ID,
    meta_campaign_id: IDS.campaign,
    meta_adset_id: IDS.adset,
    meta_ad_id: IDS.ad,
    last_synced_at: null,
    live_snapshot: null,
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
    currency_code: 'TRY',
    status: 'active',
    scopes: [...META_PUBLISH_SCOPES],
    page_id: '987654321012',
    ...over,
  }
}

function post(path: string, body: unknown, headers: Record<string, string> = { origin: 'https://gloval.ai' }) {
  return new Request(`https://gloval.ai/api/ads/meta/plans/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const manage = (body: Record<string, unknown>, headers?: Record<string, string>) =>
  managePost(post('manage', { planId: PLAN_ID, requestId: REQUEST_ID, ...body }, headers))
const sync = (body: Record<string, unknown> = {}, headers?: Record<string, string>) =>
  syncPost(post('sync', { planId: PLAN_ID, ...body }, headers))

const reserveCalls = () => mocks.rpcCalls.filter((call) => call.name === 'ads_reserve_meta_manage_action')
const finishCalls = () => mocks.rpcCalls.filter((call) => call.name === 'ads_finish_meta_manage_action')
const syncCalls = () => mocks.rpcCalls.filter((call) => call.name === 'ads_sync_meta_plan_state')

function stubEnv(over: { manage?: string; allowedManage?: string; kill?: string } = {}) {
  vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
  vi.stubEnv('META_ADS_ACCESS_MODE', 'open')
  vi.stubEnv('META_ADS_PUBLISH_ENABLED', '1')
  vi.stubEnv('META_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
  vi.stubEnv('META_ADS_MANAGE_ENABLED', over.manage ?? '1')
  vi.stubEnv('META_ADS_MANAGE_ALLOWED_USER_IDS', over.allowedManage ?? USER_ID)
  vi.stubEnv('META_ADS_KILL_SWITCH', over.kill ?? '')
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.rpcCalls.length = 0
  for (const key of Object.keys(mocks.rpcResults)) delete mocks.rpcResults[key]
  mocks.rpcResults.ads_reserve_meta_manage_action = { data: { state: 'reserved', action_id: ACTION_ID }, error: null }
  mocks.rpcResults.ads_finish_meta_manage_action = { data: null, error: null }
  mocks.rpcResults.ads_sync_meta_plan_state = { data: null, error: null }
  mocks.connection = connectionRow()
  mocks.getRequestUser.mockResolvedValue({
    kind: 'authenticated',
    user: { id: USER_ID, email: 'kullanici@ornek.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
  })
  mocks.checkRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
  mocks.getMetaPlan.mockResolvedValue(planRow())
  mocks.logUserEvent.mockResolvedValue(true)
  stubEnv()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/ads/meta/plans/manage: erişim kapıları', () => {
  it('özellik kapalıysa 404', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '0')
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(404)
    expect(g.calls).toHaveLength(0)
  })

  it('oturum yoksa 401', async () => {
    mocks.getRequestUser.mockResolvedValue({ kind: 'anonymous' })
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe('not_authenticated')
    expect(g.calls).toHaveLength(0)
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('aynı kaynaktan gelmeyen istek 403 csrf_failed', async () => {
    const g = installGraph()
    const response = await manage({ action: 'pause' }, { origin: 'https://kotu.example' })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('csrf_failed')
    expect(g.calls).toHaveLength(0)
  })

  it('origin başlığı hiç yoksa da reddedilir', async () => {
    const g = installGraph()
    const response = await manage({ action: 'pause' }, {})
    expect(response.status).toBe(403)
    expect(g.calls).toHaveLength(0)
  })

  it('hız sınırı aşılınca 429 ve hiçbir şey çalışmaz', async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 1000 })
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(429)
    expect((await response.json()).error).toBe('rate_limited')
    expect(g.calls).toHaveLength(0)
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('kill switch açıkken duraklatma dahil her şey 503', async () => {
    vi.stubEnv('META_ADS_KILL_SWITCH', '1')
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('kill_switch_active')
    expect(g.calls).toHaveLength(0)
  })

  it('yönetim izin listesinde olmayan kullanıcı 403 manage_not_allowed; duraklatma da yok', async () => {
    vi.stubEnv('META_ADS_MANAGE_ALLOWED_USER_IDS', OTHER_USER_ID)
    const g = installGraph()
    for (const body of [{ action: 'activate', termsAccepted: true }, { action: 'pause' }, { action: 'budget', dailyBudget: '50' }]) {
      const response = await manage(body)
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe('manage_not_allowed')
    }
    expect(g.calls).toHaveLength(0)
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('geçersiz gövde 400 invalid_request', async () => {
    installGraph()
    for (const body of [{ action: 'sil' }, { action: 'pause', planId: 'x' }, { action: 'pause', requestId: 'x' }, { action: 'budget', dailyBudget: 'abc' }]) {
      const response = await manage(body)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('invalid_request')
    }
    expect(mocks.rpcCalls).toHaveLength(0)
  })

  it('JSON olmayan gövde 400', async () => {
    const response = await managePost(new Request('https://gloval.ai/api/ads/meta/plans/manage', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://gloval.ai' },
      body: 'not json',
    }))
    expect(response.status).toBe(400)
  })
})

describe('POST /api/ads/meta/plans/manage: yönetim bayrağı kapalı (yalnızca koruyucu işlemler)', () => {
  beforeEach(() => stubEnv({ manage: '0' }))

  it('etkinleştirme engellenir (403), Meta\'ya yazılmaz, rezervasyon yok', async () => {
    const g = installGraph()
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('manage_not_allowed')
    expect(g.calls).toHaveLength(0)
    expect(reserveCalls()).toHaveLength(0)
  })

  it('bütçe artırma engellenir (403)', async () => {
    const g = installGraph()
    const response = await manage({ action: 'budget', dailyBudget: '150', termsAccepted: true })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('manage_not_allowed')
    expect(g.posts()).toHaveLength(0)
    expect(reserveCalls()).toHaveLength(0)
  })

  it('duraklatma çalışır (onay istemez)', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status: 'active' }))
    const g = installGraph(freshRemote({ campaign: 'ACTIVE', adset: 'ACTIVE', ad: 'ACTIVE' }))
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(200)
    expect((await response.json()).ok).toBe(true)
    expect(g.posts()).toHaveLength(1)
    expect(g.posts()[0]).toMatchObject({ id: IDS.campaign, form: { status: 'PAUSED' } })
  })

  it('bütçe azaltma çalışır ve onay istemez', async () => {
    const g = installGraph()
    const response = await manage({ action: 'budget', dailyBudget: '40' })
    expect(response.status).toBe(200)
    expect(g.posts()[0]).toMatchObject({ id: IDS.adset, form: { daily_budget: '4000' } })
    expect(reserveCalls()[0].args).toMatchObject({ p_action: 'budget', p_new_budget_minor: 4000, p_consent: null })
  })
})

describe('POST /api/ads/meta/plans/manage: onay şartı', () => {
  it('onaysız etkinleştirme 422 terms_required; rezervasyon ve Graph çağrısı yok', async () => {
    const g = installGraph()
    const response = await manage({ action: 'activate' })
    expect(response.status).toBe(422)
    expect((await response.json()).error).toBe('terms_required')
    expect(g.calls).toHaveLength(0)
    expect(reserveCalls()).toHaveLength(0)
  })

  it('termsAccepted yalnızca true değeri kabul edilir ("true" metni değil)', async () => {
    const g = installGraph()
    const response = await manage({ action: 'activate', termsAccepted: 'true' })
    expect(response.status).toBe(422)
    expect(g.calls).toHaveLength(0)
  })

  it('onaysız bütçe artırma 422 terms_required', async () => {
    const g = installGraph()
    const response = await manage({ action: 'budget', dailyBudget: '150' })
    expect(response.status).toBe(422)
    expect((await response.json()).error).toBe('terms_required')
    expect(g.calls).toHaveLength(0)
  })

  it('onayla etkinleştirme: rezervasyonda terms_version, metin, bütçe ve para birimi kaydedilir', async () => {
    installGraph()
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(200)
    expect(reserveCalls()).toHaveLength(1)
    const args = reserveCalls()[0].args
    expect(args).toMatchObject({
      p_user_id: USER_ID,
      p_plan_id: PLAN_ID,
      p_connection_id: CONNECTION_ID,
      p_request_id: REQUEST_ID,
      p_action: 'activate',
      p_terms_accepted: true,
    })
    const consent = args.p_consent as Record<string, unknown>
    expect(consent).toMatchObject({ terms_version: META_MANAGE_TERMS_VERSION, daily_budget_minor: 10_000, currency: 'TRY' })
    expect(typeof consent.text).toBe('string')
    expect(typeof consent.accepted_at).toBe('string')
  })

  it('bütçe artırmada onay yeni bütçeyi taşır', async () => {
    installGraph()
    const response = await manage({ action: 'budget', dailyBudget: '150', termsAccepted: true })
    expect(response.status).toBe(200)
    expect(reserveCalls()[0].args).toMatchObject({ p_new_budget_minor: 15_000 })
    expect(reserveCalls()[0].args.p_consent).toMatchObject({ daily_budget_minor: 15_000, terms_version: META_MANAGE_TERMS_VERSION })
  })

  it('duraklatmada onay kaydı yoktur', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status: 'active' }))
    installGraph(freshRemote({ campaign: 'ACTIVE' }))
    await manage({ action: 'pause' })
    expect(reserveCalls()[0].args.p_consent).toBeNull()
  })

  it('SQL tarafı terms_required dönerse 422', async () => {
    mocks.rpcResults.ads_reserve_meta_manage_action = { data: { state: 'terms_required' }, error: null }
    const g = installGraph()
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(422)
    expect((await response.json()).error).toBe('terms_required')
    expect(g.calls).toHaveLength(0)
  })
})

describe('POST /api/ads/meta/plans/manage: plan sahipliği ve geçişler', () => {
  it('başkasının planı veya olmayan plan 404 plan_not_found; sorgu oturumdaki kullanıcıya kapsamlanır', async () => {
    mocks.getMetaPlan.mockResolvedValue(null)
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('plan_not_found')
    expect(mocks.getMetaPlan.mock.calls[0][1]).toBe(USER_ID)
    expect(mocks.getMetaPlan.mock.calls[0][2]).toBe(PLAN_ID)
    expect(g.calls).toHaveLength(0)
    expect(reserveCalls()).toHaveLength(0)
  })

  it('SQL tarafı not_found dönerse de 404', async () => {
    mocks.rpcResults.ads_reserve_meta_manage_action = { data: { state: 'not_found' }, error: null }
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(404)
  })

  it('Meta nesne kimlikleri olmayan plan 409 transition_not_allowed', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ meta_ad_id: null }))
    const g = installGraph()
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('transition_not_allowed')
    expect(g.calls).toHaveLength(0)
  })

  it.each([
    ['published -> active', 'published', { action: 'activate', termsAccepted: true }, 'active'],
    ['active -> user_paused', 'active', { action: 'pause' }, 'user_paused'],
    ['user_paused -> active', 'user_paused', { action: 'activate', termsAccepted: true }, 'active'],
  ] as const)('izinli geçiş %s: uygulanır ve ads_finish_meta_manage_action doğru durumu yazar', async (_label, from, body, to) => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status: from }))
    const remote = to === 'user_paused' ? freshRemote({ campaign: 'ACTIVE', adset: 'ACTIVE', ad: 'ACTIVE' }) : freshRemote()
    installGraph(remote)
    const response = await manage(body)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, verified: true })
    expect(finishCalls()).toHaveLength(1)
    expect(finishCalls()[0].args).toMatchObject({
      p_user_id: USER_ID,
      p_plan_id: PLAN_ID,
      p_action_id: ACTION_ID,
      p_outcome: 'applied',
      p_new_plan_status: to,
    })
  })

  it.each([
    ['transition_not_allowed', { action: 'pause' }],
    ['plan_not_ready', { action: 'activate', termsAccepted: true }],
    ['already_failed', { action: 'activate', termsAccepted: true }],
  ] as const)('yanlış durumda (SQL: %s) 409 transition_not_allowed ve Meta\'ya yazılmaz', async (state, body) => {
    mocks.rpcResults.ads_reserve_meta_manage_action = { data: { state }, error: null }
    const g = installGraph()
    const response = await manage(body)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('transition_not_allowed')
    expect(g.posts()).toHaveLength(0)
    expect(finishCalls()).toHaveLength(0)
  })

  it('aynı bütçeye değiştirme 409 transition_not_allowed, rezervasyon yok', async () => {
    const g = installGraph()
    const response = await manage({ action: 'budget', dailyBudget: '100' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('transition_not_allowed')
    expect(reserveCalls()).toHaveLength(0)
    expect(g.posts()).toHaveLength(0)
  })

  it('bağlantı para birimi plandan farklıysa plan_changed, işlem failed biter, yazma yok', async () => {
    mocks.connection = connectionRow({ currency_code: 'USD' })
    const g = installGraph()
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('plan_changed')
    expect(g.posts()).toHaveLength(0)
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'failed', p_failure_code: 'plan_changed' })
  })

  it('ads_management izni olmayan bağlantı publish_permission_missing, işlem failed biter', async () => {
    mocks.connection = connectionRow({ scopes: ['ads_read'] })
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('publish_permission_missing')
    expect(g.calls).toHaveLength(0)
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'failed', p_failure_code: 'publish_permission_missing' })
  })

  it('bağlantı etkin değilse reauth_required (503) ve işlem failed biter', async () => {
    mocks.connection = connectionRow({ status: 'revoked' })
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('reauth_required')
    expect(g.calls).toHaveLength(0)
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'failed' })
  })

  it('rezervasyon RPC hatası 503 provider_error, Meta\'ya yazılmaz', async () => {
    mocks.rpcResults.ads_reserve_meta_manage_action = { data: null, error: { message: 'db down' } }
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('provider_error')
    expect(g.calls).toHaveLength(0)
  })
})

describe('POST /api/ads/meta/plans/manage: idempotency ve eşzamanlılık', () => {
  it('already_applied: aynı requestId tekrar gelirse Meta\'ya hiç yazılmaz, bitirme çağrısı yok', async () => {
    mocks.rpcResults.ads_reserve_meta_manage_action = { data: { state: 'already_applied' }, error: null }
    const g = installGraph()
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, alreadyApplied: true })
    expect(g.calls).toHaveLength(0)
    expect(finishCalls()).toHaveLength(0)
    expect(mocks.logUserEvent).not.toHaveBeenCalled()
  })

  it('çift tıklama: ilk istek uygular, ikincisi (aynı requestId) tekrar yazmaz ve e-posta ikinci kez gitmez', async () => {
    const g = installGraph()
    const first = await manage({ action: 'activate', termsAccepted: true })
    expect((await first.json()).ok).toBe(true)
    const postsAfterFirst = g.posts().length
    expect(postsAfterFirst).toBe(3)

    mocks.rpcResults.ads_reserve_meta_manage_action = { data: { state: 'already_applied' }, error: null }
    const second = await manage({ action: 'activate', termsAccepted: true })
    expect(await second.json()).toMatchObject({ ok: true, alreadyApplied: true })
    expect(g.posts()).toHaveLength(postsAfterFirst)
    expect(finishCalls()).toHaveLength(1)
    expect(mocks.logUserEvent).toHaveBeenCalledTimes(1)
    expect(reserveCalls().every((call) => call.args.p_request_id === REQUEST_ID)).toBe(true)
  })

  it('e-posta tekilleştirme anahtarı işlem ve requestId\'ye bağlıdır', async () => {
    installGraph()
    await manage({ action: 'activate', termsAccepted: true })
    mocks.rpcCalls.length = 0
    installGraph()
    await managePost(post('manage', { planId: PLAN_ID, requestId: REQUEST_ID_2, action: 'activate', termsAccepted: true }))
    const keys = mocks.logUserEvent.mock.calls.map((call) => call[0].dedupeKey)
    expect(keys).toEqual([`meta_ads_manage_activate_${REQUEST_ID}`, `meta_ads_manage_activate_${REQUEST_ID_2}`])
  })

  it.each(['manage_in_progress', 'in_flight_duplicate'])('SQL %s -> 409 manage_in_progress, Meta\'ya yazılmaz', async (state) => {
    mocks.rpcResults.ads_reserve_meta_manage_action = { data: { state }, error: null }
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('manage_in_progress')
    expect(g.calls).toHaveLength(0)
    expect(finishCalls()).toHaveLength(0)
  })

  it('aynı requestId farklı içerikle gelirse (idempotency_conflict) 400 invalid_request', async () => {
    mocks.rpcResults.ads_reserve_meta_manage_action = { data: { state: 'idempotency_conflict' }, error: null }
    const g = installGraph()
    const response = await manage({ action: 'pause' })
    expect(response.status).toBe(400)
    expect(g.calls).toHaveLength(0)
  })
})

describe('POST /api/ads/meta/plans/manage: e-posta', () => {
  it('başarıda tür, konu ve tekilleştirme anahtarıyla gönderilir; içerikte token ve kimlik bilgisi yok', async () => {
    installGraph()
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(200)
    const mail = mocks.logUserEvent.mock.calls[0][0]
    expect(mail).toMatchObject({ userId: USER_ID, type: 'meta_ads_manage_activate', dedupeKey: `meta_ads_manage_activate_${REQUEST_ID}` })
    const email = mail.userEmail({ emailLocale: 'tr', billingProfileIncomplete: false })
    expect(email.html).toContain('Yaz kampanyası')
    expect(email.html).toContain('act=123456789')
    expect(email.html).not.toContain(TOKEN)
    expect(JSON.stringify(mail.subject)).not.toContain(TOKEN)
    expect(JSON.stringify(mail)).not.toContain('kullanici@ornek.com')
  })

  it('bütçe e-postası önceki ve yeni bütçeyi taşır', async () => {
    installGraph()
    await manage({ action: 'budget', dailyBudget: '40' })
    const mail = mocks.logUserEvent.mock.calls[0][0]
    expect(mail.type).toBe('meta_ads_manage_budget')
    const email = mail.userEmail({ emailLocale: 'tr', billingProfileIncomplete: false })
    expect(email.html).toContain('Önceki günlük bütçe')
    expect(email.html).toContain('Yeni günlük bütçe')
  })

  it('e-posta gönderimi hata verse bile işlem sonucu değişmez', async () => {
    mocks.logUserEvent.mockRejectedValue(new Error('smtp down'))
    installGraph()
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(200)
    expect((await response.json()).ok).toBe(true)
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'applied' })
  })

  it('başarısız işlemde e-posta gönderilmez', async () => {
    const remote = freshRemote()
    remote.account.account_status = 2
    installGraph(remote)
    await manage({ action: 'activate', termsAccepted: true })
    expect(mocks.logUserEvent).not.toHaveBeenCalled()
  })
})

describe('POST /api/ads/meta/plans/manage: Meta hataları ve durum kodları', () => {
  it('ön kontrol hatası (ödeme yöntemi yok) 422 payment_required, hiçbir yazma yok, işlem failed', async () => {
    const remote = freshRemote()
    remote.account.funding_source = null
    const g = installGraph(remote)
    const response = await manage({ action: 'activate', termsAccepted: true })
    const body = await response.json()
    expect(response.status).toBe(422)
    expect(body).toMatchObject({ ok: false, error: 'payment_required', step: 'preflight', unknown: false })
    expect(g.posts()).toHaveLength(0)
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'failed', p_failure_code: 'payment_required' })
  })

  it('reklam reddedilmişse 422 ad_disapproved', async () => {
    const remote = freshRemote()
    remote.ad.effective_status = 'DISAPPROVED'
    const g = installGraph(remote)
    const response = await manage({ action: 'activate', termsAccepted: true })
    expect(response.status).toBe(422)
    expect((await response.json()).error).toBe('ad_disapproved')
    expect(g.posts()).toHaveLength(0)
  })

  it('belirsiz yazma sonucu 503 write_outcome_unknown, işlem unknown olarak biter (502/504 yok)', async () => {
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    const g = installGraph(freshRemote(), (call, index) => {
      if (call.method === 'POST') return timeout
      if (call.id === IDS.campaign && index >= 1) return new Error('network down')
      return undefined
    })
    const response = await manage({ action: 'activate', termsAccepted: true })
    const body = await response.json()
    expect(response.status).toBe(503)
    expect(body).toMatchObject({ ok: false, error: 'write_outcome_unknown', unknown: true, step: 'campaign' })
    expect(g.posts()).toHaveLength(1)
    expect(finishCalls()[0].args).toMatchObject({ p_outcome: 'unknown', p_failure_code: 'write_outcome_unknown' })
    expect(JSON.stringify(body)).not.toContain(TOKEN)
  })

  it('hiçbir senaryo 502 veya 504 döndürmez', async () => {
    const scenarios: Array<{ body: Record<string, unknown>; handler: GraphHandler }> = [
      { body: { action: 'activate', termsAccepted: true }, handler: () => json({ error: { message: 'down', code: 2 } }, 502) },
      { body: { action: 'activate', termsAccepted: true }, handler: () => json({ error: { message: 'gateway', code: 2 } }, 504) },
      { body: { action: 'pause' }, handler: () => new TypeError('fetch failed') },
      { body: { action: 'budget', dailyBudget: '40' }, handler: (call) => (call.method === 'POST' ? json({}, 504) : undefined) },
      { body: { action: 'budget', dailyBudget: '40' }, handler: (call) => (call.method === 'POST' ? json({ error: { message: 'x', code: 4 } }, 400) : undefined) },
    ]
    const statuses: number[] = []
    for (const scenario of scenarios) {
      installGraph(freshRemote(), scenario.handler)
      statuses.push((await manage(scenario.body)).status)
    }
    expect(statuses.every((status) => status !== 502 && status !== 504)).toBe(true)
    expect(statuses.every((status) => status >= 200 && status < 600)).toBe(true)
  })

  it('yanıt, kayıtlar ve çağrılarda token yalnızca Authorization başlığındadır', async () => {
    const g = installGraph(freshRemote(), (call) =>
      call.method === 'POST' && call.id === IDS.adset
        ? json({ error: { message: `Bad token ${TOKEN}`, type: 'OAuthException', code: 100 } }, 400)
        : undefined)
    const response = await manage({ action: 'activate', termsAccepted: true })
    const text = await response.text()
    expect(text).not.toContain(TOKEN)
    expect(JSON.stringify(mocks.rpcCalls)).not.toContain(TOKEN)
    expect(JSON.stringify(mocks.logUserEvent.mock.calls)).not.toContain(TOKEN)
    for (const call of g.calls) {
      expect(call.url).not.toContain(TOKEN)
      expect(call.authorization).toBe(`Bearer ${TOKEN}`)
    }
  })
})

describe('POST /api/ads/meta/plans/sync', () => {
  it('oturum yoksa 401', async () => {
    mocks.getRequestUser.mockResolvedValue({ kind: 'anonymous' })
    const g = installGraph()
    expect((await sync()).status).toBe(401)
    expect(g.calls).toHaveLength(0)
  })

  it('aynı kaynaktan gelmeyen istek 403', async () => {
    const g = installGraph()
    const response = await sync({}, { origin: 'https://kotu.example' })
    expect(response.status).toBe(403)
    expect(g.calls).toHaveLength(0)
  })

  it('hız sınırı aşılınca 429', async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 1000 })
    const g = installGraph()
    expect((await sync()).status).toBe(429)
    expect(g.calls).toHaveLength(0)
  })

  it('kill switch açıkken 503, Graph okunmaz', async () => {
    vi.stubEnv('META_ADS_KILL_SWITCH', '1')
    const g = installGraph()
    expect((await sync()).status).toBe(503)
    expect(g.calls).toHaveLength(0)
  })

  it('geçersiz planId 400', async () => {
    installGraph()
    expect((await sync({ planId: 'x' })).status).toBe(400)
  })

  describe('izin kapıları', () => {
    it('yalnızca koruyucu yönetim izni olan kullanıcı (yayın izni yok, yönetim bayrağı kapalı) senkron yapabilir', async () => {
      vi.stubEnv('META_ADS_PUBLISH_ALLOWED_USER_IDS', OTHER_USER_ID)
      vi.stubEnv('META_ADS_MANAGE_ENABLED', '0')
      vi.stubEnv('META_ADS_MANAGE_ALLOWED_USER_IDS', USER_ID)
      installGraph()
      const response = await sync()
      expect(response.status).not.toBe(403)
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(404)
      expect((await response.json()).error).not.toBe('publish_not_allowed')
    })

    it('yalnızca yayın izni olan kullanıcı hâlâ senkron yapabilir', async () => {
      vi.stubEnv('META_ADS_MANAGE_ALLOWED_USER_IDS', OTHER_USER_ID)
      installGraph()
      const response = await sync()
      expect(response.status).not.toBe(403)
    })

    it('hiçbir izni olmayan kullanıcı 403 alır ve Graph okunmaz', async () => {
      vi.stubEnv('META_ADS_PUBLISH_ALLOWED_USER_IDS', OTHER_USER_ID)
      vi.stubEnv('META_ADS_MANAGE_ALLOWED_USER_IDS', OTHER_USER_ID)
      const g = installGraph()
      const response = await sync()
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe('publish_not_allowed')
      expect(g.calls).toHaveLength(0)
      expect(syncCalls()).toHaveLength(0)
    })

    it('koruyucu izin kill switch\'i gevşetmez: 503', async () => {
      vi.stubEnv('META_ADS_PUBLISH_ALLOWED_USER_IDS', OTHER_USER_ID)
      vi.stubEnv('META_ADS_KILL_SWITCH', '1')
      const g = installGraph()
      expect((await sync()).status).toBe(503)
      expect(g.calls).toHaveLength(0)
    })

    it('koruyucu izin hız sınırını gevşetmez: 429', async () => {
      vi.stubEnv('META_ADS_PUBLISH_ALLOWED_USER_IDS', OTHER_USER_ID)
      mocks.checkRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 1000 })
      const g = installGraph()
      expect((await sync()).status).toBe(429)
      expect(g.calls).toHaveLength(0)
    })

    it('izin listesi dışındaki kullanıcı (connect yok) 404 alır', async () => {
      vi.stubEnv('META_ADS_ACCESS_MODE', 'allowlist')
      vi.stubEnv('META_ADS_ALLOWED_USER_IDS', OTHER_USER_ID)
      const g = installGraph()
      expect((await sync()).status).toBe(404)
      expect(g.calls).toHaveLength(0)
    })
  })

  it('başkasının planı / olmayan plan 404 plan_not_found', async () => {
    mocks.getMetaPlan.mockResolvedValue(null)
    const g = installGraph()
    const response = await sync()
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('plan_not_found')
    expect(mocks.getMetaPlan.mock.calls[0][1]).toBe(USER_ID)
    expect(g.calls).toHaveLength(0)
  })

  it.each(['draft', 'approved', 'publishing', 'failed', 'archived'])('%s durumundaki plan senkronlanmaz (synced=false), Graph okunmaz', async (status) => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status }))
    const g = installGraph()
    const body = await (await sync()).json()
    expect(body).toMatchObject({ ok: true, synced: false })
    expect(g.calls).toHaveLength(0)
    expect(syncCalls()).toHaveLength(0)
  })

  it('20 saniyeden yeni senkronlanmış plan veritabanından döner, Graph okunmaz', async () => {
    const snapshot = { campaign: { status: 'PAUSED' } }
    mocks.getMetaPlan.mockResolvedValue(planRow({ last_synced_at: new Date().toISOString(), live_snapshot: snapshot }))
    const g = installGraph()
    const body = await (await sync()).json()
    expect(body).toMatchObject({ ok: true, synced: false, live: snapshot })
    expect(g.calls).toHaveLength(0)
  })

  it('sapma yok: durum ve bütçe değişmez (null), RPC bir kez, Meta\'ya yazılmaz', async () => {
    const g = installGraph(freshRemote())
    const response = await sync()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, synced: true, drift: false })
    expect(syncCalls()).toHaveLength(1)
    expect(syncCalls()[0].args).toMatchObject({ p_user_id: USER_ID, p_plan_id: PLAN_ID, p_new_plan_status: null, p_new_budget_minor: null })
    expect(g.posts()).toHaveLength(0)
  })

  it('Ads Manager\'da elle açma: published -> active, RPC bir kez', async () => {
    installGraph(freshRemote({ campaign: 'ACTIVE', adset: 'ACTIVE', ad: 'ACTIVE' }))
    const body = await (await sync()).json()
    expect(body).toMatchObject({ ok: true, synced: true, drift: true })
    expect(syncCalls()).toHaveLength(1)
    expect(syncCalls()[0].args).toMatchObject({ p_new_plan_status: 'active', p_new_budget_minor: null, p_effective_status: 'ACTIVE' })
  })

  it('Ads Manager\'da elle kapama: active -> user_paused, RPC bir kez', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status: 'active' }))
    installGraph(freshRemote({ campaign: 'PAUSED', adset: 'ACTIVE', ad: 'ACTIVE' }))
    const body = await (await sync()).json()
    expect(body).toMatchObject({ synced: true, drift: true })
    expect(syncCalls()).toHaveLength(1)
    expect(syncCalls()[0].args).toMatchObject({ p_new_plan_status: 'user_paused' })
  })

  it('elle bütçe değişimi: yeni bütçe RPC\'ye iletilir, durum aynı kalır', async () => {
    mocks.getMetaPlan.mockResolvedValue(planRow({ status: 'user_paused' }))
    installGraph(freshRemote({ budget: '25000' }))
    const body = await (await sync()).json()
    expect(body).toMatchObject({ synced: true, drift: true })
    expect(syncCalls()).toHaveLength(1)
    expect(syncCalls()[0].args).toMatchObject({ p_new_plan_status: null, p_new_budget_minor: 25_000 })
  })

  it('anlık görüntü RPC\'ye gider ve token içermez', async () => {
    installGraph(freshRemote())
    await sync()
    const snapshot = syncCalls()[0].args.p_snapshot as Record<string, unknown>
    expect(snapshot).toMatchObject({ campaign: { status: 'PAUSED' } })
    expect(JSON.stringify(mocks.rpcCalls)).not.toContain(TOKEN)
  })

  it('senkron RPC hatası 503 provider_error (502/504 değil)', async () => {
    mocks.rpcResults.ads_sync_meta_plan_state = { data: null, error: { message: 'db' } }
    installGraph(freshRemote())
    const response = await sync()
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('provider_error')
  })

  it('Meta okuması başarısızsa 502/504 yerine güvenli hata kodu döner ve RPC çağrılmaz', async () => {
    installGraph(freshRemote(), () => json({ error: { message: 'down', code: 2 } }, 502))
    const response = await sync()
    expect([502, 504]).not.toContain(response.status)
    expect((await response.json()).ok).toBe(false)
    expect(syncCalls()).toHaveLength(0)
  })

  it('Meta okuma hatası yanıtında token yoktur', async () => {
    installGraph(freshRemote(), () => json({ error: { message: `token ${TOKEN}`, type: 'OAuthException', code: 190 } }, 401))
    const response = await sync()
    expect(await response.text()).not.toContain(TOKEN)
  })
})
