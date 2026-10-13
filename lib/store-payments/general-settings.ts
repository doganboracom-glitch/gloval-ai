'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { isCardProviderReady, readStorePaymentRow } from '@/lib/store-payment-config'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import { isValidTurkishIban } from '@/lib/iban'
import {
  buildPaymentSummary,
  isValidCodFeeCents,
  parseCodFeeInput,
  type CardProviderChoice,
  type PaymentSummary,
} from '@/lib/store-checkout-rules'
import {
  DEFAULT_CARD_PROVIDER,
  isCardProviderId,
  isCardProviderIntegrated,
  normalizeCardProvider,
} from '@/lib/payments/card-providers'

/**
 * Owner-facing general checkout settings (guest checkout, module switches,
 * active card provider, cash-on-delivery fee). Every entry point verifies
 * project ownership BEFORE any service-role access. No secret value ever
 * leaves this module: only booleans/derived state are returned, and the save
 * path never touches `secret_encrypted`.
 */

export type GeneralPaymentView = {
  guestCheckout: boolean
  cardEnabled: boolean
  bankEnabled: boolean
  codEnabled: boolean
  activeCardProvider: CardProviderChoice
  /** Fee in cents; 0 means no fee line. */
  codFeeCents: number
  /** Card provider has tested, readable credentials (can take a payment). */
  cardReady: boolean
  cardUnreadable: boolean
  bankIbanValid: boolean
  /** False until scripts/036 is applied; non-default values cannot be saved. */
  migrationApplied: boolean
  summary: PaymentSummary
}

export type SaveGeneralInput = {
  guestCheckout: boolean
  cardEnabled: boolean
  bankEnabled: boolean
  codEnabled: boolean
  activeCardProvider: string
  /** Fee as typed by the owner, in TL ("12,50"); blank = 0. */
  codFee: string
}

export type SaveGeneralResult =
  | { ok: true; view: GeneralPaymentView }
  | {
      ok: false
      error:
        | 'invalid_fee'
        | 'provider_unavailable'
        | 'card_not_ready'
        | 'iban_required'
        | 'migration_pending'
        | 'save_failed'
    }

type Row = {
  provider: string | null
  enabled: boolean | null
  enabled_providers: string[] | null
  public_config: Record<string, Record<string, string>> | null
  guest_checkout?: boolean | null
  active_card_provider?: string | null
  cod_fee_cents?: number | null
}

async function buildView(projectId: string): Promise<GeneralPaymentView> {
  const admin = createAdminClient()
  const { data, error } = await readStorePaymentRow(admin, projectId)
  if (error) throw new Error('read_failed')
  const row = (data as Row | null) ?? null

  const providers = Array.isArray(row?.enabled_providers) ? row!.enabled_providers! : []
  const cardEnabled = providers.some(isCardProviderId)
  const bankEnabled = providers.includes('bank_transfer')
  const codEnabled = providers.includes('cash_on_delivery')
  const guestCheckout = row?.guest_checkout !== false
  const activeCardProvider: CardProviderChoice = normalizeCardProvider(row?.active_card_provider)
  const codFeeCents = isValidCodFeeCents(row?.cod_fee_cents) ? row!.cod_fee_cents! : 0

  const cardIntegrated = isCardProviderIntegrated(activeCardProvider)
  const card = await isCardProviderReady(admin, projectId, activeCardProvider)
  const bankIbanValid = isValidTurkishIban(row?.public_config?.bank_transfer?.iban ?? '')

  const probe = await admin.from('ecommerce_payment_settings').select('guest_checkout').limit(1)
  const migrationApplied = !isMissingColumnError(probe.error)

  return {
    guestCheckout,
    cardEnabled,
    bankEnabled,
    codEnabled,
    activeCardProvider,
    codFeeCents,
    cardReady: card.ready,
    cardUnreadable: card.unreadable,
    bankIbanValid,
    migrationApplied,
    summary: buildPaymentSummary({
      cardEnabled,
      cardIntegrated,
      cardReady: card.ready,
      cardUnreadable: card.unreadable,
      bankEnabled,
      bankIbanValid,
      codEnabled,
      activeCardProvider,
      guestCheckout,
      codFeeCents,
    }),
  }
}

export async function getGeneralPaymentSettings(projectId: string): Promise<GeneralPaymentView> {
  await authorizeProjectOwner(projectId)
  return buildView(projectId)
}

/** Lightweight summary for the editor tab badge (owner/admin only). */
export async function getPaymentSummary(projectId: string): Promise<PaymentSummary | null> {
  await authorizeProjectOwner(projectId)
  try {
    return (await buildView(projectId)).summary
  } catch {
    return null
  }
}

export async function saveGeneralPaymentSettings(
  projectId: string,
  input: SaveGeneralInput,
): Promise<SaveGeneralResult> {
  const { ownerId } = await authorizeProjectOwner(projectId)
  const admin = createAdminClient()

  const feeCents = parseCodFeeInput(input.codFee)
  if (feeCents === null) return { ok: false, error: 'invalid_fee' }
  if (!isCardProviderId(input.activeCardProvider)) {
    return { ok: false, error: 'provider_unavailable' }
  }
  const activeCardProvider = input.activeCardProvider
  if (input.cardEnabled && !isCardProviderIntegrated(activeCardProvider)) {
    return { ok: false, error: 'provider_unavailable' }
  }

  const { data, error: readError } = await readStorePaymentRow(admin, projectId)
  if (readError) {
    console.error('[general-payment] read failed', { projectId, code: readError.code })
    return { ok: false, error: 'save_failed' }
  }
  const row = (data as Row | null) ?? null

  if (
    input.cardEnabled &&
    !(await isCardProviderReady(admin, projectId, activeCardProvider)).ready
  ) {
    return { ok: false, error: 'card_not_ready' }
  }
  if (
    input.bankEnabled &&
    !isValidTurkishIban(row?.public_config?.bank_transfer?.iban ?? '')
  ) {
    return { ok: false, error: 'iban_required' }
  }

  const prior = Array.isArray(row?.enabled_providers) ? row!.enabled_providers! : []
  const wanted: Record<string, boolean> = {
    bank_transfer: input.bankEnabled,
    cash_on_delivery: input.codEnabled,
  }
  // The card entry is always the active card provider; any previously stored
  // card id (including a provider that has since been removed) is dropped.
  const isStaleCardEntry = (p: string) => isCardProviderId(p) || p === 'paytr'
  const providers = [
    ...prior.filter((p) => !isStaleCardEntry(p) && (!(p in wanted) || wanted[p])),
    ...(input.cardEnabled ? [activeCardProvider] : []),
    ...Object.keys(wanted).filter((p) => wanted[p] && !prior.includes(p)),
  ]

  const base = {
    project_id: projectId,
    owner_id: ownerId,
    provider: providers[0] ?? 'mock',
    enabled: providers.length > 0,
    enabled_providers: providers,
    updated_at: new Date().toISOString(),
  }
  const checkoutColumns = {
    guest_checkout: input.guestCheckout,
    active_card_provider: activeCardProvider,
    cod_fee_cents: feeCents,
  }

  let { error } = await admin
    .from('ecommerce_payment_settings')
    .upsert({ ...base, ...checkoutColumns }, { onConflict: 'project_id' })

  if (isMissingColumnError(error)) {
    const nonDefault = !input.guestCheckout || feeCents > 0 || activeCardProvider !== DEFAULT_CARD_PROVIDER
    if (nonDefault) return { ok: false, error: 'migration_pending' }
    ;({ error } = await admin
      .from('ecommerce_payment_settings')
      .upsert(base, { onConflict: 'project_id' }))
  }
  if (error) {
    console.error('[general-payment] save failed', { projectId, code: error.code })
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath(`/ecommerce/${projectId}`)
  revalidatePath(`/ecommerce/${projectId}/odeme`)
  return { ok: true, view: await buildView(projectId) }
}
