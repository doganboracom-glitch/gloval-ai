'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptSecret } from '@/lib/crypto'
import { platformUrl } from '@/lib/domains'
import { checkRateLimit } from '@/lib/rate-limit'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { readStoredSecrets, type StoredSecrets } from '@/lib/store-payments/secrets-store'
import {
  iyzicoReturnPath,
  isIyzicoEnvironment,
  type IyzicoEnvironment,
} from '@/lib/store-payments/iyzico-constants'
import { loadIyzicoCredentials, readIyzicoPublic } from '@/lib/store-payments/iyzico-credentials'
import { testIyzicoConnection } from '@/lib/store-payments/iyzico'

/**
 * Owner-facing iyzico settings for ONE store. Ownership is verified before any
 * service-role access. The two secret keys are write-only: the view reports
 * only whether each is stored, and no response, log line or error ever carries
 * a key, a signature or a raw iyzico response.
 */

export type IyzicoSettingsView = {
  environment: IyzicoEnvironment
  apiKeyPresent: boolean
  secretKeyPresent: boolean
  /** True only after a successful test of the CURRENT keys and environment. */
  tested: boolean
  /** Stored keys exist but cannot be decrypted. */
  unreadable: boolean
  /** Read-only address the owner can register with iyzico. */
  returnUrl: string
}

export type SaveIyzicoInput = {
  /** Blank keeps the stored value. */
  apiKey: string
  secretKey: string
  environment: string
}

export type SaveIyzicoResult =
  | { ok: true; view: IyzicoSettingsView }
  | { ok: false; error: 'invalid_environment' | 'missing_keys' | 'invalid_keys' | 'secrets_unreadable' | 'save_failed' }

export type TestIyzicoResult =
  | { ok: true; view: IyzicoSettingsView }
  | {
      ok: false
      error: 'not_configured' | 'unreadable' | 'auth' | 'rejected' | 'unavailable' | 'rate_limited'
      view?: IyzicoSettingsView
    }

const MAX_KEY_LENGTH = 200
const KEY_PATTERN = /^[\x21-\x7e]+$/

type Row = {
  public_config: Record<string, Record<string, string>> | null
  secret_encrypted: string | null
}

function returnUrlFor(projectId: string): string {
  return platformUrl(iyzicoReturnPath(projectId))
}

async function readRow(projectId: string): Promise<{ row: Row | null; failed: boolean }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ecommerce_payment_settings')
    .select('public_config, secret_encrypted')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) return { row: null, failed: true }
  return { row: (data as Row | null) ?? null, failed: false }
}

function viewFromRow(projectId: string, row: Row | null): IyzicoSettingsView {
  let stored: StoredSecrets = {}
  let unreadable = false
  try {
    stored = readStoredSecrets(row?.secret_encrypted ?? null)
  } catch {
    unreadable = true
  }
  const pub = readIyzicoPublic(row?.public_config)
  const apiKeyPresent = Boolean(stored.iyzico?.api_key)
  const secretKeyPresent = Boolean(stored.iyzico?.secret_key)
  return {
    environment: pub.environment,
    apiKeyPresent,
    secretKeyPresent,
    tested: pub.tested && apiKeyPresent && secretKeyPresent && !unreadable,
    unreadable,
    returnUrl: returnUrlFor(projectId),
  }
}

export async function getIyzicoSettings(projectId: string): Promise<IyzicoSettingsView> {
  await authorizeProjectOwner(projectId)
  const { row } = await readRow(projectId)
  return viewFromRow(projectId, row)
}

async function persist(
  projectId: string,
  ownerId: string,
  row: Row | null,
  next: { secrets: StoredSecrets; environment: IyzicoEnvironment; tested: boolean },
): Promise<boolean> {
  const admin = createAdminClient()
  const publicConfig = {
    ...(row?.public_config ?? {}),
    iyzico: { environment: next.environment, tested: next.tested ? 'true' : 'false' },
  }
  const secretEncrypted =
    Object.keys(next.secrets).length > 0 ? encryptSecret(JSON.stringify(next.secrets)) : null

  if (row) {
    const { error } = await admin
      .from('ecommerce_payment_settings')
      .update({
        public_config: publicConfig,
        secret_encrypted: secretEncrypted,
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
    return !error
  }
  const { error } = await admin.from('ecommerce_payment_settings').insert({
    project_id: projectId,
    owner_id: ownerId,
    provider: 'mock',
    enabled: false,
    enabled_providers: [],
    public_config: publicConfig,
    secret_encrypted: secretEncrypted,
    updated_at: new Date().toISOString(),
  })
  return !error
}

function refresh(projectId: string) {
  revalidatePath(`/ecommerce/${projectId}`)
  revalidatePath(`/ecommerce/${projectId}/odeme`)
}

/**
 * Saves the environment and keys. Any change to a key or to the environment
 * resets the connection test, so a provider can only be switched on with keys
 * that were tested exactly as stored.
 */
export async function saveIyzicoSettings(
  projectId: string,
  input: SaveIyzicoInput,
): Promise<SaveIyzicoResult> {
  const { ownerId } = await authorizeProjectOwner(projectId)
  if (!isIyzicoEnvironment(input.environment)) return { ok: false, error: 'invalid_environment' }

  const apiKeyIn = (input.apiKey ?? '').trim()
  const secretKeyIn = (input.secretKey ?? '').trim()
  for (const value of [apiKeyIn, secretKeyIn]) {
    if (value && (value.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(value))) {
      return { ok: false, error: 'invalid_keys' }
    }
  }

  const { row, failed } = await readRow(projectId)
  if (failed) return { ok: false, error: 'save_failed' }

  let stored: StoredSecrets
  try {
    stored = readStoredSecrets(row?.secret_encrypted ?? null)
  } catch {
    return { ok: false, error: 'secrets_unreadable' }
  }

  const prior = readIyzicoPublic(row?.public_config)
  const nextApiKey = apiKeyIn || stored.iyzico?.api_key || ''
  const nextSecretKey = secretKeyIn || stored.iyzico?.secret_key || ''
  if (!nextApiKey || !nextSecretKey) return { ok: false, error: 'missing_keys' }

  const changed =
    Boolean(apiKeyIn) ||
    Boolean(secretKeyIn) ||
    prior.environment !== input.environment ||
    !prior.tested

  const secrets: StoredSecrets = {
    ...stored,
    iyzico: { api_key: nextApiKey, secret_key: nextSecretKey },
  }
  const ok = await persist(projectId, ownerId, row, {
    secrets,
    environment: input.environment,
    tested: changed ? false : prior.tested,
  })
  if (!ok) {
    console.error('[store-iyzico] settings save failed', { projectId })
    return { ok: false, error: 'save_failed' }
  }
  refresh(projectId)
  const after = await readRow(projectId)
  return { ok: true, view: viewFromRow(projectId, after.row) }
}

/**
 * Connection test: a tiny checkout-form initialize with the stored keys. No
 * order is created and nothing is charged. Rate limited per store.
 */
export async function testIyzicoConnectionAction(projectId: string): Promise<TestIyzicoResult> {
  const { ownerId } = await authorizeProjectOwner(projectId)

  const limit = checkRateLimit(`iyzico-test:${projectId}`, 5, 60_000)
  if (!limit.allowed) return { ok: false, error: 'rate_limited' }

  const admin = createAdminClient()
  const loaded = await loadIyzicoCredentials(admin, projectId)
  if (!loaded.ok) {
    return { ok: false, error: loaded.reason === 'unreadable' ? 'unreadable' : 'not_configured' }
  }

  let outcome
  try {
    outcome = await testIyzicoConnection(loaded.creds, returnUrlFor(projectId))
  } catch {
    outcome = { ok: false as const, error: 'unavailable' as const }
  }

  const { row, failed } = await readRow(projectId)
  if (failed) return { ok: false, error: 'unavailable' }

  // 'unavailable' says nothing about the keys, so it leaves the flag as is.
  if (outcome.ok || outcome.error !== 'unavailable') {
    let stored: StoredSecrets
    try {
      stored = readStoredSecrets(row?.secret_encrypted ?? null)
    } catch {
      return { ok: false, error: 'unreadable' }
    }
    const saved = await persist(projectId, ownerId, row, {
      secrets: stored,
      environment: loaded.creds.environment,
      tested: outcome.ok,
    })
    if (!saved) return { ok: false, error: 'unavailable' }
    refresh(projectId)
  }

  const after = await readRow(projectId)
  const view = viewFromRow(projectId, after.row)
  return outcome.ok ? { ok: true, view } : { ok: false, error: outcome.error, view }
}
