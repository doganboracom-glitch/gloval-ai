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
  rpcResult: { ok: true } as any,
  rpcError: null as any,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  enqueueActivation: vi.fn(),
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
        select: () => {
          const query: any = {
            eq: () => query,
            in: () => query,
            maybeSingle: async () => ({ data: state.existingPartner, error: state.lookupError }),
          }
          return query
        },
        insert: (value: Record<string, unknown>) => {
          state.inserts.push(value)
          const query: any = {
            select: () => query,
            maybeSingle: async () => ({
              data: state.insertError ? null : { id: 'partner-id' },
              error: state.insertError,
            }),
          }
          return query
        },
        update: (value: Record<string, unknown>) => {
          state.updatePayload = value
          const query: any = {
            eq: () => query,
            in: () => query,
            is: () => query,
            select: () => query,
            maybeSingle: async () => ({
              data: state.updatedRows ? { id: 'partner-id' } : null,
              error: state.updateError,
            }),
          }
          return query
        },
      }),
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args })
        return { data: state.rpcResult, error: state.rpcError }
      },
    }
  }),
}))

vi.mock('@/lib/maker-requests/outbox', () => ({
  enqueueReferralPartnerActivationEmail: state.enqueueActivation,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  acceptReferralTerms,
  activateReferralPartner,
  closeReferralPartner,
  saveReferralPartnerIban,
} from '@/lib/referrals/partner-actions'
import { REFERRAL_TERMS_VERSION } from '@/lib/referrals/terms'

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
    termsVersion: REFERRAL_TERMS_VERSION,
    lang: 'tr',
  }
}

function configureRuntime() {
  vi.stubEnv('REFERRAL_ENABLED', '1')
  vi.stubEnv('REFERRAL_COOKIE_HMAC_ACTIVE_VERSION', 'v1')
  vi.stubEnv('REFERRAL_COOKIE_HMAC_KEY_V1', 'c'.repeat(32))
  vi.stubEnv('REFERRAL_CLICK_HMAC_KEY_V1', 'd'.repeat(32))
  vi.stubEnv('REFERRAL_IBAN_ENC_ACTIVE_VERSION', 'v1')
  vi.stubEnv('REFERRAL_IBAN_ENC_KEY_V1', 'e'.repeat(32))
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
  state.rpcResult = { ok: true }
  state.rpcError = null
  state.rpcCalls = []
  state.enqueueActivation.mockReset().mockResolvedValue(undefined)
  state.adminCalls = 0
  state.userCalls = 0
  configureRuntime()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
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
    const iban = validTurkishIban()

    const result = await activateReferralPartner({ ...validInput(), iban })

    expect(result.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({
      user_id: 'owner-id',
      status: 'active',
      terms_version: REFERRAL_TERMS_VERSION,
      payee_name: 'Ayşe Yılmaz',
      tax_status: 'individual',
      iban_key_version: 'v1',
      iban_last4: iban.slice(-4),
    })
    expect(state.inserts[0].iban_ciphertext).not.toContain(iban)
    expect(JSON.stringify(result)).not.toContain(iban)
    expect(result).not.toHaveProperty('payeeName')
    expect(state.enqueueActivation).toHaveBeenCalledWith(expect.objectContaining({
      partnerId: 'partner-id',
      referralCode: expect.any(String),
      activatedAt: expect.any(String),
      lang: 'tr',
    }))
  })

  it('keeps partner activation successful if the notification queue throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    state.enqueueActivation.mockRejectedValueOnce(new Error('outbox unavailable'))

    const result = await activateReferralPartner(validInput())

    expect(result.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(consoleError).toHaveBeenCalledWith('[referrals] activation notification enqueue failed')
  })

  it('records explicit acceptance of the current terms for an existing partner', async () => {
    state.existingPartner = { id: 'partner-id', status: 'active' }

    const result = await acceptReferralTerms({ termsAccepted: true, termsVersion: REFERRAL_TERMS_VERSION })

    expect(result).toEqual({ ok: true })
    expect(state.updatePayload).toMatchObject({ terms_version: REFERRAL_TERMS_VERSION })
    expect(state.updatePayload?.terms_accepted_at).toEqual(expect.any(String))
  })

  it('does not record a stale or unchecked terms acceptance', async () => {
    await expect(acceptReferralTerms({ termsAccepted: true, termsVersion: 'v1.1' })).resolves.toEqual({
      ok: false,
      error: 'terms_required',
    })
    await expect(acceptReferralTerms({ termsAccepted: false, termsVersion: REFERRAL_TERMS_VERSION })).resolves.toEqual({
      ok: false,
      error: 'terms_required',
    })
    expect(state.adminCalls).toBe(0)
  })

  it('saves an IBAN only for an active partner with no stored IBAN', async () => {
    state.existingPartner = { id: 'partner-id', terms_version: REFERRAL_TERMS_VERSION }
    const iban = validTurkishIban()

    const result = await saveReferralPartnerIban({ iban })

    expect(result).toEqual({ ok: true, ibanLast4: iban.slice(-4) })
    expect(state.updatePayload).toMatchObject({
      iban_key_version: 'v1',
      iban_last4: iban.slice(-4),
    })
    expect(state.updatePayload?.iban_ciphertext).not.toContain(iban)
  })

  it('closes an active partnership through the audited status transition', async () => {
    state.existingPartner = { id: 'partner-id' }

    const result = await closeReferralPartner()

    expect(result).toEqual({ ok: true })
    expect(state.rpcCalls).toEqual([{
      name: 'transition_referral_partner_status',
      args: {
        p_partner_id: 'partner-id',
        p_actor_user_id: 'owner-id',
        p_action: 'close',
      },
    }])
    expect(state.updatePayload).toBeNull()
  })
})
