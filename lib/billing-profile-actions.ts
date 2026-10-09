'use server'

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { exportAdminBillingProfilesCsv } from '@/lib/admin/billing-profile-data'
import {
  BILLING_PROFILE_COLUMNS,
  getBillingProfileForUser,
  getBillingProfileStatusForUser,
  toBillingProfileSummary,
} from '@/lib/billing-profile-store'
import { validateBillingProfileInput } from '@/lib/billing-profile-validation'
import { fieldForConstraint, parseConstraintName, saveFailureLog, validationFailureLog } from '@/lib/billing-profile-save-errors'
import type { BillingProfileSummary } from '@/lib/billing-profile-types'

export async function getMyBillingProfileAction() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { available: false, profile: null }
    return getBillingProfileForUser(user.id)
  } catch {
    return { available: false, profile: null }
  }
}

export async function getMyBillingProfileStatusAction() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { available: false, complete: false }
    return getBillingProfileStatusForUser(user.id)
  } catch {
    return { available: false, complete: false }
  }
}

export type SaveBillingProfileResult =
  | { ok: true; profile: BillingProfileSummary }
  | { ok: false; error: 'unauthenticated' | 'unavailable' | 'validation' | 'save_failed'; fieldErrors?: Record<string, string> }

export async function saveBillingProfileAction(input: unknown): Promise<SaveBillingProfileResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { ok: false, error: 'unauthenticated' }

    const admin = createAdminClient()
    const { data: existing, error: readError } = await admin
      .from('billing_profiles')
      .select(BILLING_PROFILE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle()
    if (readError) {
      console.error(saveFailureLog(readError).replace('save_failed', 'read_failed'))
      return { ok: false, error: 'unavailable' }
    }

    const validation = validateBillingProfileInput(input, {
      existingNationalId: existing?.national_id ?? null,
      existingTaxNumber: existing?.tax_number ?? null,
    })
    if (!validation.ok) {
      console.warn(validationFailureLog(validation.fieldErrors))
      return { ok: false, error: 'validation', fieldErrors: validation.fieldErrors }
    }

    const value = validation.value
    const now = new Date().toISOString()
    const fields = {
      user_id: user.id,
      customer_type: value.customerType,
      full_name: value.fullName || null,
      company_title: value.customerType === 'company' ? value.companyTitle : null,
      tax_office: value.customerType === 'company' ? value.taxOffice : null,
      tax_number: value.customerType === 'company' ? value.taxNumber : null,
      national_id: value.customerType === 'individual' ? value.nationalId : null,
      address_line: value.addressLine,
      district: value.district,
      city: value.city,
      postal_code: value.postalCode || null,
      country: value.country,
      phone: value.phone,
      invoice_email: value.invoiceEmail,
      e_invoice_payer: value.eInvoicePayer,
      updated_at: now,
    }

    const { error: saveError } = await admin
      .from('billing_profiles')
      .upsert(fields, { onConflict: 'user_id' })
    if (saveError) {
      console.error(saveFailureLog(saveError))
      const field = fieldForConstraint(parseConstraintName(saveError.message), value.customerType)
      return {
        ok: false,
        error: 'save_failed',
        ...(field ? { fieldErrors: { [field]: 'invalid' as const } } : {}),
      }
    }

    const createdAt = existing?.created_at ?? now
    return {
      ok: true,
      profile: toBillingProfileSummary({ ...fields, created_at: createdAt } as Parameters<typeof toBillingProfileSummary>[0]),
    }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function exportBillingProfilesCsvAction(filter: unknown, language: unknown) {
  try {
    return await exportAdminBillingProfilesCsv(filter, language)
  } catch {
    return { ok: false as const, error: 'unavailable' as const }
  }
}
