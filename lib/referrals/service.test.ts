import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createReferralCookieToken,
  createReferralSignupIntent,
  verifyReferralCookieToken,
} from './core'

const { state, mocks } = vi.hoisted(() => ({
  state: {
    partners: [] as Array<Record<string, any>>,
    users: {} as Record<string, { id: string; created_at: string }>,
    attributions: [] as Array<Record<string, any>>,
    intents: [] as Array<Record<string, any>>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    clickKeys: new Set<string>(),
  },
  mocks: {
    createAdminClient: vi.fn(),
    checkRateLimit: vi.fn(),
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))

import {
  captureReferralClick,
  markReferralVerifiedForUser,
  saveEmailReferralAtSignup,
  saveOAuthReferralAtSignup,
} from './service'

const NOW = Date.UTC(2026, 10, 3, 12)
const PARTNER_ID = '22222222-2222-4222-8222-222222222222'
const PARTNER_USER_ID = '33333333-3333-4333-8333-333333333333'
const REFERRED_USER_ID = '44444444-4444-4444-8444-444444444444'
const IP = '203.0.113.42'
const ENV = {
  REFERRAL_ENABLED: '1',
  REFERRAL_COOKIE_HMAC_ACTIVE_VERSION: 'v1',
  REFERRAL_COOKIE_HMAC_KEY_V1: 'cookie-secret-0123456789-abcdefghijkl',
  REFERRAL_CLICK_HMAC_KEY_V1: 'click-secret-0123456789-abcdefghijkl',
}

type Row = Record<string, any>
type Filter = (row: Row) => boolean

function tableRows(table: string): Row[] {
  if (table === 'referral_partners') return state.partners
  if (table === 'referral_attributions') return state.attributions
  if (table === 'referral_signup_intents') return state.intents
  throw new Error(`Unexpected table ${table}`)
}

function query(table: string) {
  let operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | null = null
  const filters: Filter[] = []

  const run = () => {
    const rows = tableRows(table)
    if (operation === 'insert') {
      if (
        table === 'referral_attributions' &&
        rows.some((row) => row.referred_user_id === payload?.referred_user_id)
      ) {
        return { data: null, error: { code: '23505', message: 'duplicate referral attribution' } }
      }
      if (
        table === 'referral_signup_intents' &&
        rows.some((row) => row.intent_hash === payload?.intent_hash)
      ) {
        return { data: null, error: { code: '23505', message: 'duplicate signup intent' } }
      }
      const inserted = {
        ...(table === 'referral_attributions' ? { id: '55555555-5555-4555-8555-555555555555' } : {}),
        consumed_at: null,
        ...payload,
      }
      rows.push(inserted)
      return { data: [inserted], error: null }
    }

    const matching = rows.filter((row) => filters.every((filter) => filter(row)))
    if (operation === 'update' && payload) matching.forEach((row) => Object.assign(row, payload))
    if (operation === 'delete') {
      const remaining = rows.filter((row) => !matching.includes(row))
      if (table === 'referral_partners') state.partners = remaining
      if (table === 'referral_attributions') state.attributions = remaining
      if (table === 'referral_signup_intents') state.intents = remaining
    }
    return { data: matching, error: null }
  }

  const builder: any = {
    select: () => builder,
    insert: (value: Row) => {
      operation = 'insert'
      payload = value
      return builder
    },
    update: (value: Row) => {
      operation = 'update'
      payload = value
      return builder
    },
    delete: () => {
      operation = 'delete'
      return builder
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value)
      return builder
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value)
      return builder
    },
    gt: (column: string, value: string) => {
      filters.push((row) => String(row[column]) > value)
      return builder
    },
    lt: (column: string, value: string) => {
      filters.push((row) => String(row[column]) < value)
      return builder
    },
    maybeSingle: async () => {
      const result = run()
      return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }
    },
    then: (resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  }
  return builder
}

function createAdminClient() {
  return {
    from: (table: string) => query(table),
    auth: {
      admin: {
        getUserById: async (userId: string) => ({
          data: { user: state.users[userId] ?? null },
          error: null,
        }),
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      const key = `${args.p_partner_id}:${args.p_subject_hash}`
      if (name !== 'record_referral_click') return { data: false, error: null }
      if (state.clickKeys.has(key)) return { data: false, error: null }
      state.clickKeys.add(key)
      return { data: true, error: null }
    },
  }
}

async function referralCookie(partnerId = PARTNER_ID, code = 'PARTNER01') {
  const token = await createReferralCookieToken({
    partnerId,
    referralCode: code,
    capturedAt: NOW - 60_000,
  })
  if (!token) throw new Error('Expected a signed referral cookie in this test')
  return token
}

async function seedIntent(source: 'email' | 'oauth') {
  const intent = await createReferralSignupIntent(source, NOW)
  if (!intent) throw new Error('Expected a signed signup intent in this test')
  state.intents.push({
    intent_hash: intent.intentHash,
    source,
    expires_at: new Date(intent.expiresAt).toISOString(),
    consumed_at: null,
  })
  return intent.token
}

beforeEach(() => {
  vi.stubEnv('REFERRAL_ENABLED', ENV.REFERRAL_ENABLED)
  vi.stubEnv('REFERRAL_COOKIE_HMAC_ACTIVE_VERSION', ENV.REFERRAL_COOKIE_HMAC_ACTIVE_VERSION)
  vi.stubEnv('REFERRAL_COOKIE_HMAC_KEY_V1', ENV.REFERRAL_COOKIE_HMAC_KEY_V1)
  vi.stubEnv('REFERRAL_CLICK_HMAC_KEY_V1', ENV.REFERRAL_CLICK_HMAC_KEY_V1)
  state.partners = [{ id: PARTNER_ID, user_id: PARTNER_USER_ID, referral_code: 'PARTNER01', status: 'active' }]
  state.users = {}
  state.attributions = []
  state.intents = []
  state.rpcCalls = []
  state.clickKeys = new Set()
  mocks.createAdminClient.mockReset()
  mocks.createAdminClient.mockImplementation(createAdminClient)
  mocks.checkRateLimit.mockReset()
  mocks.checkRateLimit.mockReturnValue({ allowed: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('captureReferralClick', () => {
  it('does not query storage for malformed or inactive codes', async () => {
    const malformed = await captureReferralClick({
      code: 'not-a-code',
      existingCookie: null,
      ipAddress: IP,
      now: NOW,
    })
    expect(malformed).toEqual({ handled: true, cookieToken: null })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()

    const inactive = await captureReferralClick({
      code: 'PARTNER99',
      existingCookie: null,
      ipAddress: IP,
      now: NOW,
    })
    expect(inactive).toEqual({ handled: true, cookieToken: null })
    expect(mocks.createAdminClient).toHaveBeenCalled()
    expect(state.rpcCalls).toHaveLength(0)
  })

  it.each(['closed', 'suspended'] as const)(
    'rejects clicks and signup attribution when the partner is %s',
    async (status) => {
      state.partners[0].status = status
      const inactiveClick = await captureReferralClick({
        code: 'PARTNER01',
        existingCookie: null,
        ipAddress: IP,
        now: NOW,
      })

      expect(inactiveClick).toEqual({ handled: true, cookieToken: null })
      expect(state.rpcCalls).toHaveLength(0)

      state.partners[0].status = 'active'
      const referralToken = await referralCookie()
      const intentToken = await seedIntent('email')
      state.users[REFERRED_USER_ID] = {
        id: REFERRED_USER_ID,
        created_at: new Date(NOW + 1_000).toISOString(),
      }
      state.partners[0].status = status

      await expect(
        saveEmailReferralAtSignup({
          userId: REFERRED_USER_ID,
          intentToken,
          referralCookie: referralToken,
          now: NOW + 2_000,
        }),
      ).resolves.toBe(false)
      expect(state.attributions).toHaveLength(0)
    },
  )

  it('sets the first-touch cookie and increments a unique click only once per IP/day', async () => {
    const first = await captureReferralClick({
      code: 'partner01',
      existingCookie: null,
      ipAddress: IP,
      now: NOW,
    })
    const second = await captureReferralClick({
      code: 'PARTNER01',
      existingCookie: first.cookieToken,
      ipAddress: IP,
      now: NOW + 1_000,
    })

    expect(first.cookieToken).toBeTruthy()
    expect(second.cookieToken).toBeNull()
    expect(state.rpcCalls).toHaveLength(2)
    expect(state.clickKeys.size).toBe(1)
    expect(JSON.stringify(state.rpcCalls)).not.toContain(IP)
    expect(JSON.stringify(mocks.checkRateLimit.mock.calls)).not.toContain(IP)
  })

  it('never replaces a valid first-touch cookie with a later referral', async () => {
    const secondPartnerId = '55555555-5555-4555-8555-555555555555'
    state.partners.push({
      id: secondPartnerId,
      user_id: '66666666-6666-4666-8666-666666666666',
      referral_code: 'PARTNER02',
      status: 'active',
    })
    const firstTouch = await referralCookie()
    const result = await captureReferralClick({
      code: 'PARTNER02',
      existingCookie: firstTouch,
      ipAddress: IP,
      now: NOW,
    })

    expect(result.cookieToken).toBeNull()
    await expect(verifyReferralCookieToken(firstTouch, NOW)).resolves.toMatchObject({
      partnerId: PARTNER_ID,
      referralCode: 'PARTNER01',
    })
    expect(state.rpcCalls[0]?.args.p_partner_id).toBe(secondPartnerId)
  })
})

describe('signup attribution', () => {
  it('binds a fresh email signup once, without overwriting prior attribution', async () => {
    const intentToken = await seedIntent('email')
    const referralToken = await referralCookie()
    state.users[REFERRED_USER_ID] = {
      id: REFERRED_USER_ID,
      created_at: new Date(NOW + 1_000).toISOString(),
    }

    const saved = await saveEmailReferralAtSignup({
      userId: REFERRED_USER_ID,
      intentToken,
      referralCookie: referralToken,
      now: NOW + 2_000,
    })
    expect(saved).toBe(true)
    expect(state.attributions).toHaveLength(1)
    expect(state.attributions[0]).toMatchObject({
      referred_user_id: REFERRED_USER_ID,
      partner_id: PARTNER_ID,
      code_snapshot: 'PARTNER01',
      source: 'email',
    })
    expect(state.intents[0]?.consumed_at).toBeTruthy()

    const reused = await saveEmailReferralAtSignup({
      userId: REFERRED_USER_ID,
      intentToken,
      referralCookie: referralToken,
      now: NOW + 2_000,
    })
    expect(reused).toBe(false)
    expect(state.attributions).toHaveLength(1)
  })

  it('rejects a self-referral', async () => {
    state.partners[0].user_id = REFERRED_USER_ID
    const intentToken = await seedIntent('email')
    state.users[REFERRED_USER_ID] = {
      id: REFERRED_USER_ID,
      created_at: new Date(NOW + 1_000).toISOString(),
    }

    await expect(
      saveEmailReferralAtSignup({
        userId: REFERRED_USER_ID,
        intentToken,
        referralCookie: await referralCookie(),
        now: NOW + 2_000,
      }),
    ).resolves.toBe(false)
    expect(state.attributions).toHaveLength(0)
  })

  it('rejects an existing OAuth account created before its signed signup intent', async () => {
    const intentToken = await seedIntent('oauth')
    const saved = await saveOAuthReferralAtSignup({
      userId: REFERRED_USER_ID,
      userCreatedAt: new Date(NOW - 1_000).toISOString(),
      intentToken,
      referralCookie: await referralCookie(),
      now: NOW + 2_000,
    })

    expect(saved).toBe(false)
    expect(state.intents[0]?.consumed_at).toBeNull()
    expect(state.attributions).toHaveLength(0)
  })

  it('binds a new OAuth account only with its fresh, one-time signup intent', async () => {
    const intentToken = await seedIntent('oauth')
    const saved = await saveOAuthReferralAtSignup({
      userId: REFERRED_USER_ID,
      userCreatedAt: new Date(NOW + 1_000).toISOString(),
      intentToken,
      referralCookie: await referralCookie(),
      now: NOW + 2_000,
    })

    expect(saved).toBe(true)
    expect(state.attributions[0]).toMatchObject({
      referred_user_id: REFERRED_USER_ID,
      partner_id: PARTNER_ID,
      source: 'oauth',
    })
    expect(state.intents[0]?.consumed_at).toBeTruthy()

    await expect(
      saveOAuthReferralAtSignup({
        userId: REFERRED_USER_ID,
        userCreatedAt: new Date(NOW + 1_000).toISOString(),
        intentToken,
        referralCookie: await referralCookie(),
        now: NOW + 2_000,
      }),
    ).resolves.toBe(false)
    expect(state.attributions).toHaveLength(1)
  })

  it('rejects intent-token source mismatches and expired signup intents', async () => {
    const emailIntent = await seedIntent('email')
    state.users[REFERRED_USER_ID] = {
      id: REFERRED_USER_ID,
      created_at: new Date(NOW + 1_000).toISOString(),
    }
    await expect(
      saveOAuthReferralAtSignup({
        userId: REFERRED_USER_ID,
        userCreatedAt: state.users[REFERRED_USER_ID].created_at,
        intentToken: emailIntent,
        referralCookie: await referralCookie(),
        now: NOW + 2_000,
      }),
    ).resolves.toBe(false)

    const expired = await createReferralSignupIntent('email', NOW - 11 * 60_000)
    expect(expired).not.toBeNull()
    state.intents.push({
      intent_hash: expired?.intentHash,
      source: 'email',
      expires_at: new Date(expired?.expiresAt ?? NOW).toISOString(),
      consumed_at: null,
    })
    await expect(
      saveEmailReferralAtSignup({
        userId: REFERRED_USER_ID,
        intentToken: expired?.token ?? null,
        referralCookie: await referralCookie(),
        now: NOW + 2_000,
      }),
    ).resolves.toBe(false)
    expect(state.attributions).toHaveLength(0)
    expect(state.intents[1]?.consumed_at).toBeNull()
  })
})

describe('verification flag', () => {
  it('does not query or update referral data while the program is disabled', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '0')

    await expect(markReferralVerifiedForUser(REFERRED_USER_ID)).resolves.toBe(false)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(state.attributions).toHaveLength(0)
  })

  it('marks only an unverified referral after the program is enabled', async () => {
    state.attributions = [{ referred_user_id: REFERRED_USER_ID, verified_at: null }]

    await expect(markReferralVerifiedForUser(REFERRED_USER_ID)).resolves.toBe(true)
    expect(state.attributions[0]?.verified_at).toBeTruthy()
  })
})
