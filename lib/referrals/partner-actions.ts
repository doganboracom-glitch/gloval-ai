'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/supabase/request-user'
import { isReferralRuntimeReady } from '@/lib/referrals/core'
import { enqueueReferralPartnerActivationEmail } from '@/lib/maker-requests/outbox'
import {
  generateReferralCode,
  normalizeReferralPayeeName,
  normalizeReferralTaxStatus,
  normalizeTurkishIban,
} from '@/lib/referrals/partner-core'
import { encryptReferralIban } from '@/lib/referrals/partner-encryption'
import { REFERRAL_TERMS_VERSION } from '@/lib/referrals/terms'

type PartnerActionError =
  | 'not_authenticated'
  | 'program_unavailable'
  | 'invalid_input'
  | 'terms_required'
  | 'invalid_name'
  | 'invalid_tax_status'
  | 'invalid_iban'
  | 'encryption_unavailable'
  | 'already_registered'
  | 'not_active'
  | 'iban_unavailable'

type PartnerActionResult =
  | { ok: true; referralCode: string; ibanLast4: string }
  | { ok: false; error: PartnerActionError }

type ClosePartnerResult = { ok: true } | { ok: false; error: PartnerActionError }

export async function activateReferralPartner(input: {
  payeeName: unknown
  taxStatus: unknown
  iban: unknown
  termsAccepted: unknown
  termsVersion: unknown
  lang?: unknown
}): Promise<PartnerActionResult> {
  if (!isReferralRuntimeReady()) return { ok: false, error: 'program_unavailable' }

  const authState = await getRequestUser()
  if (authState.kind !== 'authenticated') return { ok: false, error: 'not_authenticated' }
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' }

  if (input.termsAccepted !== true || input.termsVersion !== REFERRAL_TERMS_VERSION) {
    return { ok: false, error: 'terms_required' }
  }

  const payeeName = normalizeReferralPayeeName(input.payeeName)
  if (!payeeName) return { ok: false, error: 'invalid_name' }

  const taxStatus = normalizeReferralTaxStatus(input.taxStatus)
  if (!taxStatus) return { ok: false, error: 'invalid_tax_status' }

  const iban = normalizeTurkishIban(input.iban)
  if (!iban) return { ok: false, error: 'invalid_iban' }

  const activatedAt = new Date().toISOString()
  const encrypted = await encryptReferralIban(iban)
  if (!encrypted.ok) {
    return {
      ok: false,
      error: encrypted.reason === 'invalid_iban' ? 'invalid_iban' : 'encryption_unavailable',
    }
  }

  try {
    const admin = createAdminClient()
    const { data: existing, error: lookupError } = await admin
      .from('referral_partners')
      .select('referral_code,status')
      .eq('user_id', authState.user.id)
      .maybeSingle()

    if (lookupError) return { ok: false, error: 'program_unavailable' }
    if (existing) return { ok: false, error: 'already_registered' }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const referralCode = generateReferralCode()
      const { error } = await admin.from('referral_partners').insert({
        user_id: authState.user.id,
        referral_code: referralCode,
        status: 'active',
        terms_version: REFERRAL_TERMS_VERSION,
        terms_accepted_at: activatedAt,
        created_at: activatedAt,
        payee_name: payeeName,
        tax_status: taxStatus,
        iban_ciphertext: encrypted.ciphertext,
        iban_key_version: encrypted.keyVersion,
        iban_last4: encrypted.last4,
      })

    if (!error) {
      try {
        await enqueueReferralPartnerActivationEmail({
          referralCode,
          activatedAt,
          lang: input.lang === 'en' ? 'en' : 'tr',
        })
      } catch {
        console.error('[referrals] activation notification enqueue failed')
      }
      revalidatePath('/settings')
      revalidatePath('/dashboard')
      return { ok: true, referralCode, ibanLast4: encrypted.ibanLast4 }
    }

      if (error.code !== '23505') return { ok: false, error: 'program_unavailable' }

      const { data: racedPartner, error: raceLookupError } = await admin
        .from('referral_partners')
        .select('referral_code,status')
        .eq('user_id', authState.user.id)
        .maybeSingle()
      if (raceLookupError) return { ok: false, error: 'program_unavailable' }
      if (racedPartner) return { ok: false, error: 'already_registered' }
    }
  } catch {
    return { ok: false, error: 'program_unavailable' }
  }

  return { ok: false, error: 'program_unavailable' }
}

export async function saveReferralPartnerIban(input: { iban: unknown }): Promise<
  | { ok: true; ibanLast4: string }
  | { ok: false; error: PartnerActionError }
> {
  if (!isReferralRuntimeReady()) return { ok: false, error: 'program_unavailable' }

  const authState = await getRequestUser()
  if (authState.kind !== 'authenticated') return { ok: false, error: 'not_authenticated' }
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' }

  const iban = normalizeTurkishIban(input.iban)
  if (!iban) return { ok: false, error: 'invalid_iban' }

  const encrypted = await encryptReferralIban(iban)
  if (!encrypted.ok) {
    return {
      ok: false,
      error: encrypted.reason === 'invalid_iban' ? 'invalid_iban' : 'encryption_unavailable',
    }
  }

  try {
    const { data, error } = await createAdminClient()
      .from('referral_partners')
      .update({
        iban_ciphertext: encrypted.ciphertext,
        iban_key_version: encrypted.keyVersion,
        iban_last4: encrypted.last4,
      })
      .eq('user_id', authState.user.id)
      .eq('status', 'active')
      .is('iban_ciphertext', null)
      .select('id')
      .maybeSingle()

    if (error || !data) return { ok: false, error: 'iban_unavailable' }

    revalidatePath('/settings')
    revalidatePath('/dashboard')
    return { ok: true, ibanLast4: encrypted.last4 }
  } catch {
    return { ok: false, error: 'program_unavailable' }
  }
}

export async function closeReferralPartner(): Promise<ClosePartnerResult> {
  if (!isReferralRuntimeReady()) return { ok: false, error: 'program_unavailable' }

  const authState = await getRequestUser()
  if (authState.kind !== 'authenticated') return { ok: false, error: 'not_authenticated' }

  try {
    const admin = createAdminClient()
    const { data: partner, error: lookupError } = await admin
      .from('referral_partners')
      .select('id')
      .eq('user_id', authState.user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (lookupError) return { ok: false, error: 'program_unavailable' }
    if (!partner) return { ok: false, error: 'not_active' }

    const { data, error } = await admin.rpc('transition_referral_partner_status', {
      p_partner_id: partner.id,
      p_actor_user_id: authState.user.id,
      p_action: 'close',
    })
    if (error) return { ok: false, error: 'program_unavailable' }

    const transition = data as { ok?: unknown; error?: unknown } | null
    if (transition?.ok !== true) {
      return {
        ok: false,
        error: transition?.error === 'invalid_transition' ? 'not_active' : 'program_unavailable',
      }
    }

    revalidatePath('/settings')
    revalidatePath('/dashboard')
    revalidatePath('/admin/referrals')
    return { ok: true }
  } catch {
    return { ok: false, error: 'program_unavailable' }
  }
}
