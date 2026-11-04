import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  REFERRAL_COOKIE_NAME,
  REFERRAL_SIGNUP_INTENT_COOKIE_NAME,
} from '@/lib/referrals/core'
import { REFERRAL_TERMS_VERSION } from '@/lib/referrals/terms'

type Row = Record<string, any>

const { state, mocks } = vi.hoisted(() => ({
  state: {
    partner: null as Row | null,
    intents: [] as Row[],
    attributions: [] as Row[],
    users: {} as Record<string, Row>,
    clicks: 0,
    clickSubjects: new Set<string>(),
  },
  mocks: {
    createAdminClient: vi.fn(),
    getRequestUser: vi.fn(),
    checkRateLimit: vi.fn(),
    revalidatePath: vi.fn(),
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/supabase/request-user', () => ({ getRequestUser: mocks.getRequestUser }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { POST as createSignupIntent } from '@/app/api/referrals/signup-intent/route'
import { activateReferralPartner } from '@/lib/referrals/partner-actions'
import { getReferralDashboardData } from '@/lib/referrals/partner-data'
import {
  captureReferralClick,
  markReferralVerifiedForUser,
  saveEmailReferralAtSignup,
} from '@/lib/referrals/service'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const PARTNER_ID = '22222222-2222-4222-8222-222222222222'
const REFERRED_USER_ID = '33333333-3333-4333-8333-333333333333'
const IP_ADDRESS = '203.0.113.42'

function rowsFor(table: string): Row[] {
  if (table === 'referral_partners') return state.partner ? [state.partner] : []
  if (table === 'referral_signup_intents') return state.intents
  if (table === 'referral_attributions') return state.attributions
  throw new Error(`Unexpected table ${table}`)
}

function createQuery(table: string) {
  let operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | null = null
  const filters: Array<(row: Row) => boolean> = []

  const execute = () => {
    const rows = rowsFor(table)
    if (operation === 'insert') {
      const inserted = {
        ...(table === 'referral_partners' ? { id: PARTNER_ID } : {}),
        ...(table === 'referral_signup_intents' ? { consumed_at: null } : {}),
        ...(table === 'referral_attributions' ? { verified_at: null } : {}),
        ...payload,
      }
      if (table === 'referral_partners') state.partner = inserted
      else rows.push(inserted)
      return { data: [inserted], error: null }
    }

    const matching = rows.filter((row) => filters.every((filter) => filter(row)))
    if (operation === 'update' && payload) matching.forEach((row) => Object.assign(row, payload))
    if (operation === 'delete' && table === 'referral_signup_intents') {
      state.intents = rows.filter((row) => !matching.includes(row))
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
      filters.push((row) => row[column] === value || (value === null && row[column] === undefined))
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
      const result = execute()
      return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }
    },
    then: (resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(execute()).then(resolve, reject),
  }
  return builder
}

function createFakeSupabaseClient() {
  return {
    from: (table: string) => createQuery(table),
    auth: {
      admin: {
        getUserById: async (userId: string) => ({
          data: { user: state.users[userId] ?? null },
          error: null,
        }),
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'record_referral_click') {
        if (state.partner?.status !== 'active' || !state.partner.user_id) {
          return { data: false, error: null }
        }
        const key = `${args.p_partner_id}:${args.p_subject_hash}`
        if (state.clickSubjects.has(key)) return { data: false, error: null }
        state.clickSubjects.add(key)
        state.clicks += 1
        return { data: true, error: null }
      }

      if (name === 'referral_partner_dashboard') {
        if (!state.partner || state.partner.user_id !== args.p_user_id) {
          return { data: [], error: null }
        }
        const customers = state.attributions.map((attribution) => {
          const user = state.users[attribution.referred_user_id]
          return {
            email: user?.email ?? null,
            status: attribution.verified_at ? 'verified' : 'signup',
            createdAt: attribution.captured_at,
          }
        })
        return {
          data: [{
            referralCode: state.partner.referral_code,
            status: state.partner.status,
            clicks: state.clicks,
            signups: state.attributions.length,
            verifiedSignups: state.attributions.filter((row) => row.verified_at).length,
            paidCustomers: 0,
            customers,
          }],
          error: null,
        }
      }

      return { data: null, error: null }
    },
  }
}

function validTurkishIban(): string {
  const account = '1234567890123456789012'
  let remainder = 0
  for (const character of `${account}TR00`) {
    const code = character.charCodeAt(0)
    const expanded = code >= 65 && code <= 90 ? String(code - 55) : character
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return `TR${String(98 - remainder).padStart(2, '0')}${account}`
}

beforeEach(() => {
  state.partner = null
  state.intents = []
  state.attributions = []
  state.users = {}
  state.clicks = 0
  state.clickSubjects = new Set()
  mocks.createAdminClient.mockReset().mockImplementation(createFakeSupabaseClient)
  mocks.getRequestUser.mockReset().mockResolvedValue({
    kind: 'authenticated',
    user: { id: OWNER_ID },
  })
  mocks.checkRateLimit.mockReset().mockReturnValue({ allowed: true, retryAfterMs: 0 })
  mocks.revalidatePath.mockReset()
  vi.stubEnv('REFERRAL_ENABLED', '1')
  vi.stubEnv('REFERRAL_COOKIE_HMAC_ACTIVE_VERSION', 'v1')
  vi.stubEnv('REFERRAL_COOKIE_HMAC_KEY_V1', 'cookie-secret-0123456789-abcdefghijkl')
  vi.stubEnv('REFERRAL_CLICK_HMAC_KEY_V1', 'click-secret-0123456789-abcdefghijkl')
  vi.stubEnv('REFERRAL_IBAN_ENC_ACTIVE_VERSION', 'v1')
  vi.stubEnv('REFERRAL_IBAN_ENC_KEY_V1', 'e'.repeat(32))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('local referral end-to-end with a fake Supabase client', () => {
  it('activates, generates a code, captures a click, creates signup intent, verifies email, and returns dashboard counts', async () => {
    const activation = await activateReferralPartner({
      payeeName: 'Local Test Partner',
      taxStatus: 'individual',
      iban: validTurkishIban(),
      termsAccepted: true,
      termsVersion: REFERRAL_TERMS_VERSION,
    })

    expect(activation.ok).toBe(true)
    if (!activation.ok) throw new Error('Expected partner activation to succeed')
    expect(activation.referralCode).toMatch(/^[A-Z0-9]{8,16}$/u)

    const referralUrl = new URL('https://gloval.ai/')
    referralUrl.searchParams.set('ref', activation.referralCode)
    const click = await captureReferralClick({
      code: referralUrl.searchParams.get('ref'),
      existingCookie: null,
      ipAddress: IP_ADDRESS,
    })

    expect(click.cookieToken).toBeTruthy()
    expect(state.clicks).toBe(1)

    const signupResponse = await createSignupIntent(new NextRequest(
      'https://gloval.ai/api/referrals/signup-intent',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${REFERRAL_COOKIE_NAME}=${click.cookieToken}`,
          'x-vercel-forwarded-for': IP_ADDRESS,
        },
        body: JSON.stringify({ source: 'email' }),
      },
    ))
    const intentToken = signupResponse.cookies.get(REFERRAL_SIGNUP_INTENT_COOKIE_NAME)?.value

    expect(signupResponse.status).toBe(204)
    expect(intentToken).toBeTruthy()

    const signupTime = Date.now()
    state.users[REFERRED_USER_ID] = {
      id: REFERRED_USER_ID,
      created_at: new Date(signupTime + 1_000).toISOString(),
      email: 'referred@example.test',
    }
    await expect(saveEmailReferralAtSignup({
      userId: REFERRED_USER_ID,
      intentToken: intentToken ?? null,
      referralCookie: click.cookieToken,
      now: signupTime + 2_000,
    })).resolves.toBe(true)
    await expect(markReferralVerifiedForUser(REFERRED_USER_ID)).resolves.toBe(true)

    const dashboard = await getReferralDashboardData()
    expect(dashboard).toMatchObject({
      referralCode: activation.referralCode,
      clicks: 1,
      signups: 1,
      verifiedSignups: 1,
      paidCustomers: 0,
    })
    expect(dashboard?.customers).toHaveLength(1)
    expect(dashboard?.customers[0].maskedEmail).toContain('example.test')
    expect(state.intents[0]?.consumed_at).toBeTruthy()
    expect(mocks.createAdminClient).toHaveBeenCalled()
  })
})
