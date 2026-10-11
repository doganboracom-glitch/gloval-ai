'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptSecret } from '@/lib/crypto'
import { tenantUrl } from '@/lib/domains'
import { checkRateLimit } from '@/lib/rate-limit'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { readStoredSecrets, type StoredSecrets } from '@/lib/store-payments/secrets-store'
import { testPaytrCredentials } from '@/lib/store-payments/paytr-client'
import {
  credentialFingerprint,
  maskSecret,
  pickClientIp,
  validatePaytrInput,
  type PaytrCredentials,
  type PaytrFieldErrors,
} from '@/lib/store-payments/paytr-core'

export type PaytrSettingsView = {
  merchantId: string
  maskedKey: string | null
  maskedSalt: string | null
  testMode: boolean
  enabled: boolean
  /** True when the stored credentials passed a connection test. */
  tested: boolean
  unreadable: boolean
  callbackUrl: string
}

export type PaytrActionResult =
  | { ok: true; view: PaytrSettingsView }
  | { ok: false; error: string; fieldErrors?: PaytrFieldErrors }

type Row = {
  enabled: boolean | null
  provider: string | null
  enabled_providers: string[] | null
  public_config: Record<string, Record<string, string>> | null
  secret_encrypted: string | null
}

async function loadRow(projectId: string): Promise<Row | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ecommerce_payment_settings')
    .select('enabled, provider, enabled_providers, public_config, secret_encrypted')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw new Error('read_failed')
  return (data as Row | null) ?? null
}

function callbackUrl(): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || 'https://gloval.ai').replace(/\/$/, '')}/api/store/webhook/paytr`
}

function buildView(row: Row | null, unreadable: boolean, secrets: StoredSecrets): PaytrSettingsView {
  const slot = secrets.paytr ?? {}
  const pub = row?.public_config?.paytr ?? {}
  const credentials: PaytrCredentials | null =
    pub.merchant_id && slot.merchant_key && slot.merchant_salt
      ? {
          merchantId: pub.merchant_id,
          merchantKey: slot.merchant_key,
          merchantSalt: slot.merchant_salt,
          testMode: pub.test_mode === '1',
        }
      : null
  return {
    merchantId: pub.merchant_id ?? '',
    maskedKey: maskSecret(slot.merchant_key),
    maskedSalt: maskSecret(slot.merchant_salt),
    testMode: pub.test_mode === '1',
    enabled: Boolean(row?.enabled) && (row?.enabled_providers ?? []).includes('paytr'),
    tested: Boolean(credentials && slot.tested_fp && slot.tested_fp === credentialFingerprint(credentials)),
    unreadable,
    callbackUrl: callbackUrl(),
  }
}

async function readView(projectId: string): Promise<PaytrSettingsView> {
  const row = await loadRow(projectId)
  try {
    return buildView(row, false, readStoredSecrets(row?.secret_encrypted ?? null))
  } catch {
    return buildView(row, true, {})
  }
}

export async function getPaytrSettings(projectId: string): Promise<PaytrSettingsView> {
  await authorizeProjectOwner(projectId)
  return readView(projectId)
}

async function persist(
  projectId: string,
  ownerId: string,
  row: Row | null,
  secrets: StoredSecrets,
  patch: { merchantId: string; testMode: boolean; enabled: boolean } | { disconnect: true },
): Promise<boolean> {
  const admin = createAdminClient()
  const publicConfig = { ...(row?.public_config ?? {}) }
  const nextSecrets: StoredSecrets = { ...secrets }
  let providers = (row?.enabled_providers ?? []).filter((p) => p !== 'paytr')

  if ('disconnect' in patch) {
    delete publicConfig.paytr
    delete nextSecrets.paytr
  } else {
    publicConfig.paytr = {
      merchant_id: patch.merchantId,
      test_mode: patch.testMode ? '1' : '0',
    }
    if (patch.enabled) providers = ['paytr', ...providers]
  }

  const primary =
    providers[0] ?? (row?.provider && row.provider !== 'paytr' ? row.provider : 'mock')
  const { error } = await admin.from('ecommerce_payment_settings').upsert(
    {
      project_id: projectId,
      owner_id: ownerId,
      provider: primary,
      enabled: providers.length > 0,
      enabled_providers: providers,
      public_config: publicConfig,
      secret_encrypted:
        Object.keys(nextSecrets).length > 0 ? encryptSecret(JSON.stringify(nextSecrets)) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' },
  )
  if (error) {
    console.error('[paytr-settings] save failed', { projectId, code: error.code })
    return false
  }
  revalidatePath(`/ecommerce/${projectId}`)
  revalidatePath(`/ecommerce/${projectId}/odeme`)
  return true
}

export type SavePaytrInput = {
  merchantId: string
  /** Blank keeps the stored value. */
  merchantKey: string
  merchantSalt: string
  testMode: boolean
  /** Offer card payments at checkout. Requires a passed connection test. */
  enabled: boolean
}

/**
 * Saves the store's own PayTR credentials. Enabling is only allowed for a
 * credential set that passed a connection test (bound by fingerprint, so any
 * later edit has to be re-tested).
 */
export async function savePaytrSettings(
  projectId: string,
  input: SavePaytrInput,
): Promise<PaytrActionResult> {
  const { ownerId } = await authorizeProjectOwner(projectId)

  let row: Row | null
  let secrets: StoredSecrets
  try {
    row = await loadRow(projectId)
    secrets = readStoredSecrets(row?.secret_encrypted ?? null)
  } catch {
    return { ok: false, error: 'secrets_unreadable' }
  }

  const slot = secrets.paytr ?? {}
  const { values, errors } = validatePaytrInput(input, {
    hasKey: Boolean(slot.merchant_key),
    hasSalt: Boolean(slot.merchant_salt),
  })
  if (Object.keys(errors).length > 0) return { ok: false, error: 'invalid_fields', fieldErrors: errors }

  const merchantKey = values.merchantKey || slot.merchant_key
  const merchantSalt = values.merchantSalt || slot.merchant_salt
  const next: PaytrCredentials = {
    merchantId: values.merchantId,
    merchantKey,
    merchantSalt,
    testMode: input.testMode,
  }
  const fingerprint = credentialFingerprint(next)
  const stillTested = slot.tested_fp === fingerprint

  if (input.enabled && !stillTested) return { ok: false, error: 'test_required' }

  const nextSecrets: StoredSecrets = {
    ...secrets,
    paytr: {
      merchant_key: merchantKey,
      merchant_salt: merchantSalt,
      ...(stillTested ? { tested_fp: fingerprint } : {}),
    },
  }

  const saved = await persist(projectId, ownerId, row, nextSecrets, {
    merchantId: values.merchantId,
    testMode: input.testMode,
    enabled: input.enabled && stillTested,
  })
  if (!saved) return { ok: false, error: 'save_failed' }
  return { ok: true, view: await readView(projectId) }
}

/**
 * Runs a throwaway PayTR token request with the STORED credentials and, on
 * success, records the credential fingerprint so the store can be enabled.
 */
export async function testPaytrConnection(projectId: string): Promise<PaytrActionResult> {
  const { ownerId, actorId } = await authorizeProjectOwner(projectId)

  const limit = checkRateLimit(`paytr-test:${actorId}:${projectId}`, 5, 60_000)
  if (!limit.allowed) return { ok: false, error: 'rate_limited' }

  let row: Row | null
  let secrets: StoredSecrets
  try {
    row = await loadRow(projectId)
    secrets = readStoredSecrets(row?.secret_encrypted ?? null)
  } catch {
    return { ok: false, error: 'secrets_unreadable' }
  }

  const slot = secrets.paytr ?? {}
  const pub = row?.public_config?.paytr ?? {}
  if (!pub.merchant_id || !slot.merchant_key || !slot.merchant_salt) {
    return { ok: false, error: 'not_saved' }
  }
  const credentials: PaytrCredentials = {
    merchantId: pub.merchant_id,
    merchantKey: slot.merchant_key,
    merchantSalt: slot.merchant_salt,
    testMode: pub.test_mode === '1',
  }

  const requestHeaders = await headers()
  const userIp = pickClientIp((name) => requestHeaders.get(name))
  if (!userIp) return { ok: false, error: 'ip_unavailable' }

  const admin = createAdminClient()
  const { data: project } = await admin.from('projects').select('slug').eq('id', projectId).maybeSingle()
  const returnUrl = project?.slug ? `${tenantUrl(project.slug as string)}/` : 'https://gloval.ai/'

  const result = await testPaytrCredentials(credentials, userIp, returnUrl)
  if (!result.ok) return { ok: false, error: result.error }

  const nextSecrets: StoredSecrets = {
    ...secrets,
    paytr: { ...slot, tested_fp: credentialFingerprint(credentials) },
  }
  const wasEnabled = Boolean(row?.enabled) && (row?.enabled_providers ?? []).includes('paytr')
  const saved = await persist(projectId, ownerId, row, nextSecrets, {
    merchantId: pub.merchant_id,
    testMode: pub.test_mode === '1',
    enabled: wasEnabled,
  })
  if (!saved) return { ok: false, error: 'save_failed' }
  return { ok: true, view: await readView(projectId) }
}

/** Removes the store's PayTR credentials and stops offering card payments. */
export async function disconnectPaytr(projectId: string): Promise<PaytrActionResult> {
  const { ownerId } = await authorizeProjectOwner(projectId)
  let row: Row | null
  let secrets: StoredSecrets
  try {
    row = await loadRow(projectId)
    secrets = readStoredSecrets(row?.secret_encrypted ?? null)
  } catch {
    return { ok: false, error: 'secrets_unreadable' }
  }
  const saved = await persist(projectId, ownerId, row, secrets, { disconnect: true })
  if (!saved) return { ok: false, error: 'save_failed' }
  return { ok: true, view: await readView(projectId) }
}
