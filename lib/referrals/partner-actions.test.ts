import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authState: null as any,
  existingPartner: null as any,
  lookupError: null as any,
  insertError: null as any,
  inserts: [] as Array<Record<string, unknown>>,
  updatePayload: null as Record<string, unknown> | null,
  updateError: null as any,
  updatedRows: 1,
  adminCalls: 0,
  userCalls: 0,
}))

vi.mock('@/lib/supabase/request-user', () => ({
  getRequestUser: vi.fn(async () => {
    state.userCalls += 1
    return state.authState
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    state.adminCalls += 1
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.existingPartner, error: state.lookupError }),
          }),
        }),
        insert: async (value: Record<string, unknown>) => {
          state.inserts.push(value)
          return { error: state.insertError }
        },
        update: (value: Record<string, unknown>) => {
          state.updatePayload = value
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: state.updatedRows ? { id: 'partner-id' } : null,
                    error: state.updateError,
                  }),
                }),
              }),
            }),
          }
        },
      }),
    }
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { activateReferralPartner, closeReferralPartner } from '@/lib/referrals/partner-actions'

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

function validInput() {
  return {
    payeeName: 'Ayşe Yılmaz',
    taxStatus: 'individual',
    iban: validTurkishIban(),
    termsAccepted: true,
    termsVersion: 'v1.0',
  }
}

function configureRuntime() {
  vi.stubEnv('REFERRAL_ENABLED', '1')
  vi.stubEnv('REFERRAL_COOKIE_HMAC_ACTIVE_VERSION', 'v1')
  vi.stubEnv('REFERRAL_COOKIE_HMAC_KEY_V1', 'c'.repeat(32))
  vi.stubEnv('REFERRAL_CLICK_HMAC_KEY_V1', 'd'.repeat(32))
}

beforeEach(() => {
  state.authState = { kind: 'authenticated', user: { id: 'owner-id' } }
  state.existingPartner = null
  state.lookupError = null
  state.insertError = null
  state.inserts = []
  state.updatePayload = null
  state.updateError = null
  state.updatedRows = 1
  state.adminCalls = 0
  state.userCalls = 0
  configureRuntime()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('referral partner actions', () => {
  it('requires an authenticated account before database access', async () => {
    state.authState = { kind: 'unauthenticated' }

    await expect(activateReferralPartner(validInput())).resolves.toEqual({
      ok: false,
      error: 'not_authenticated',
    })
    expect(state.adminCalls).toBe(0)
  })

  it('requires the current terms version and explicit acceptance', async () => {
    await expect(activateReferralPartner({ ...validInput(), termsVersion: 'v0.9' })).resolves.toEqual({
      ok: false,
      error: 'terms_required',
    })
    expect(state.adminCalls).toBe(0)
  })

  it('returns a safe error and writes nothing when the IBAN key is missing', async () => {
    vi.stubEnv('REFERRAL_IBAN_ENC_ACTIVE_VERSION', '')

    await expect(activateReferralPartner(validInput())).resolves.toEqual({
      ok: false,
      error: 'encryption_unavailable',
    })
    expect(state.adminCalls).toBe(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('stores an encrypted IBAN, last four digits, active status, and accepted terms only', async () => {
    vi.stubEnv('REFERRAL_IBAN_ENC_ACTIVE_VERSION', 'v1')
    vi.stubEnv('REFERRAL_IBAN_ENC_KEY_V1', 'e'.repeat(32))
    const iban = validTurkishIban()

    const result = await activateReferralPartner({ ...validInput(), iban })

    expect(result.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({
      user_id: 'owner-id',
      status: 'active',
      terms_version: 'v1.0',
      payee_name: 'Ayşe Yılmaz',
      tax_status: 'individual',
      iban_key_version: 'v1',
      iban_last4: iban.slice(-4),
    })
    expect(state.inserts[0].iban_ciphertext).not.toContain(iban)
    expect(JSON.stringify(result)).not.toContain(iban)
    expect(result).not.toHaveProperty('payeeName')
  })

  it('closes an active partnership and clears encrypted payout details', async () => {
    const result = await closeReferralPartner()

    expect(result).toEqual({ ok: true })
    expect(state.updatePayload).toEqual({
      status: 'closed',
      payee_name: null,
      tax_status: null,
      iban_ciphertext: null,
      iban_key_version: null,
      iban_last4: null,
    })
  })
})
