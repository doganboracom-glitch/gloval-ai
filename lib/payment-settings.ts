'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import { PAYMENT_METHODS, type PaymentMethodId } from '@/lib/payments/methods'
import { loadStorePaymentConfig } from '@/lib/store-payment-config'

/**
 * Owner-facing payment configuration for an e-commerce project.
 *
 * A store owner chooses which methods to offer (PayTR / iyzico / Havale-EFT)
 * and fills in their own credentials. Non-secret fields (merchant id, IBAN,
 * bank instructions) live in `public_config`; secret credentials (keys, salts)
 * are AES-encrypted into `secret_encrypted` and NEVER returned to the client.
 *
 * Ownership is verified before any read/write. Writes use the service-role
 * client only AFTER that ownership check, so a caller can only ever touch a
 * store they own (or an allow-listed admin acting on a tenant's store).
 */

const VALID_METHODS = new Set<PaymentMethodId>(PAYMENT_METHODS.map((m) => m.id))

export type PaymentSettingsView = {
  /** Methods the owner has enabled (buyer-selectable at checkout). */
  enabled: PaymentMethodId[]
  /** Non-secret config values, keyed by method then field. */
  publicConfig: Record<string, Record<string, string>>
  /** Which secret fields already have a stored value (booleans only). */
  secretsPresent: Record<string, Record<string, boolean>>
  /** True when stored secrets exist but cannot be decrypted (key rotated/corrupt). */
  secretsUnreadable?: boolean
}

export type SavePaymentSettingsInput = {
  enabled: string[]
  publicConfig: Record<string, Record<string, string>>
  /** New secret values; a blank/absent field keeps the existing stored secret. */
  secrets: Record<string, Record<string, string>>
}

/** Verifies the caller owns the project (or is an admin) and returns owner id. */
async function authorizeProjectOwner(projectId: string): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')

  const { data: owned } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned) return owned.owner_id as string

  if (isAdminEmail(user.email ?? null)) {
    const admin = createAdminClient()
    const { data: proj } = await admin
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (proj) return proj.owner_id as string
  }
  throw new Error('NOT_FOUND')
}

type StoredSecrets = Record<string, Record<string, string>>

class SecretsUnreadableError extends Error {
  constructor() {
    super('Stored payment secrets could not be decrypted.')
    this.name = 'SecretsUnreadableError'
  }
}

/**
 * Decrypts the stored secrets. A present-but-unreadable blob (wrong key,
 * corruption, bad JSON) THROWS instead of reading as "no secrets": returning
 * `{}` there would let the next save silently overwrite the owner's real
 * credentials. Nothing from the ciphertext or plaintext is logged by callers.
 */
function readStoredSecrets(encrypted: string | null): StoredSecrets {
  if (!encrypted) return {}
  try {
    const parsed: unknown = JSON.parse(decryptSecret(encrypted))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SecretsUnreadableError()
    }
    return parsed as StoredSecrets
  } catch {
    throw new SecretsUnreadableError()
  }
}

/** Loads the current settings for the owner UI. Secrets are reduced to booleans. */
export async function getPaymentSettingsForOwner(
  projectId: string,
): Promise<PaymentSettingsView> {
  await authorizeProjectOwner(projectId)
  const admin = createAdminClient()

  const { data } = await admin
    .from('ecommerce_payment_settings')
    .select('enabled, enabled_providers, provider, public_config, secret_encrypted')
    .eq('project_id', projectId)
    .maybeSingle()

  const enabledRaw: string[] =
    Array.isArray(data?.enabled_providers) && data!.enabled_providers.length > 0
      ? (data!.enabled_providers as string[])
      : data?.enabled && data?.provider
        ? [data.provider as string]
        : []
  const enabled = enabledRaw.filter((m): m is PaymentMethodId =>
    VALID_METHODS.has(m as PaymentMethodId),
  )

  const publicConfig = (data?.public_config as Record<string, Record<string, string>>) ?? {}
  let stored: StoredSecrets = {}
  let secretsUnreadable = false
  try {
    stored = readStoredSecrets(data?.secret_encrypted ?? null)
  } catch {
    secretsUnreadable = true
    console.error('[payment-settings] stored secrets unreadable', { projectId })
  }

  const secretsPresent: Record<string, Record<string, boolean>> = {}
  for (const method of PAYMENT_METHODS) {
    const present: Record<string, boolean> = {}
    for (const f of method.fields) {
      if (f.kind === 'secret') {
        present[f.key] = Boolean(stored[method.id]?.[f.key])
      }
    }
    if (Object.keys(present).length > 0) secretsPresent[method.id] = present
  }

  return { enabled, publicConfig, secretsPresent, secretsUnreadable }
}

/**
 * Whether the owner's store can currently take real payments. Mock-only (the
 * non-production opt-in) does not count as ready.
 */
export async function getStorePaymentReadiness(
  projectId: string,
): Promise<{ ready: boolean; unreadable: boolean }> {
  await authorizeProjectOwner(projectId)
  const resolution = await loadStorePaymentConfig(projectId)
  if (!resolution.ok) {
    return { ready: false, unreadable: resolution.reason === 'config_unreadable' }
  }
  return { ready: resolution.methods.some((m) => m !== 'mock'), unreadable: false }
}

export type SaveResult = { ok: true } | { ok: false; error: string; missing?: string[] }

/**
 * Persists the owner's payment configuration. Validates that every enabled
 * method has its required fields (a required secret counts as satisfied if it
 * was already stored), merges new secrets over existing ones, encrypts them,
 * and upserts the single per-project settings row.
 */
export async function savePaymentSettings(
  projectId: string,
  input: SavePaymentSettingsInput,
): Promise<SaveResult> {
  const ownerId = await authorizeProjectOwner(projectId)
  const admin = createAdminClient()

  // Normalize + validate the enabled set against the known methods.
  const enabled = Array.from(new Set(input.enabled)).filter((m): m is PaymentMethodId =>
    VALID_METHODS.has(m as PaymentMethodId),
  )

  // Load existing secrets so blank fields keep their stored value.
  const { data: existingRow, error: existingError } = await admin
    .from('ecommerce_payment_settings')
    .select('secret_encrypted')
    .eq('project_id', projectId)
    .maybeSingle()
  // A failed read is not "no stored secrets"; saving on top of it could wipe them.
  if (existingError) {
    console.error('[payment-settings] existing row read failed', {
      projectId,
      code: existingError.code,
    })
    return { ok: false, error: 'save_failed' }
  }
  let storedSecrets: StoredSecrets
  try {
    storedSecrets = readStoredSecrets(existingRow?.secret_encrypted ?? null)
  } catch {
    console.error('[payment-settings] stored secrets unreadable, save rejected', { projectId })
    return { ok: false, error: 'secrets_unreadable' }
  }

  const nextPublic: Record<string, Record<string, string>> = {}
  const nextSecrets: StoredSecrets = {}
  const missing: string[] = []

  for (const methodId of enabled) {
    const meta = PAYMENT_METHODS.find((m) => m.id === methodId)!
    const pubIn = input.publicConfig[methodId] ?? {}
    const secIn = input.secrets[methodId] ?? {}
    const priorSec = storedSecrets[methodId] ?? {}

    const pub: Record<string, string> = {}
    const sec: Record<string, string> = { ...priorSec }

    for (const field of meta.fields) {
      if (field.kind === 'secret') {
        const incoming = (secIn[field.key] ?? '').trim()
        if (incoming) sec[field.key] = incoming
        if (field.required && !sec[field.key]) {
          missing.push(`${meta.name.tr} · ${field.label.tr}`)
        }
      } else {
        const val = (pubIn[field.key] ?? '').trim()
        if (val) pub[field.key] = val
        if (field.required && !val) {
          missing.push(`${meta.name.tr} · ${field.label.tr}`)
        }
      }
    }
    nextPublic[methodId] = pub
    if (Object.keys(sec).length > 0) nextSecrets[methodId] = sec
  }

  if (missing.length > 0) {
    return { ok: false, error: 'missing_fields', missing }
  }

  const primary: PaymentMethodId | 'mock' = enabled[0] ?? 'mock'
  const secretEncrypted =
    Object.keys(nextSecrets).length > 0 ? encryptSecret(JSON.stringify(nextSecrets)) : null

  const { error } = await admin.from('ecommerce_payment_settings').upsert(
    {
      project_id: projectId,
      owner_id: ownerId,
      provider: primary,
      enabled: enabled.length > 0,
      enabled_providers: enabled,
      public_config: nextPublic,
      secret_encrypted: secretEncrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' },
  )

  if (error) return { ok: false, error: 'save_failed' }

  revalidatePath(`/ecommerce/${projectId}`)
  revalidatePath(`/ecommerce/${projectId}/odeme`)
  return { ok: true }
}
