import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { lookupTargetByEmail } from '@/lib/custom-domains/handover/service'
import { normalizeDomain } from '@/lib/custom-domains/normalize'
import { buildDnsRecords, newVerificationToken } from '@/lib/custom-domains/connection'
import { placeholderDns } from '@/lib/custom-domains/mock-provider'
import { parsePurchaseDomain } from './service'
import { getDomainRegistrarProvider } from './provider'
import { isManageCapable } from './types'
import type { ManagedDomainDetails } from './types'
import { parseProviderDateAssumingIstanbul } from './provider-date'
import type {
  AdminDomainImportError,
  ExpiresAtSource,
  AdminDomainImportResult,
  PendingAdminDomainImport,
  PendingAdminDomainImportsResult,
  PreviewAdminDomainImportResult,
  RegistrarImportPreview,
} from './admin-import-types'

const ERROR_CODES: Record<string, AdminDomainImportError> = {
  invalid_domain: 'invalid_domain',
  invalid_email: 'invalid_email',
  reason_required: 'reason_required',
  domain_not_owned: 'domain_not_owned',
  domain_not_active: 'domain_not_active',
  expiry_unavailable: 'expiry_unavailable',
  domain_expired: 'domain_expired',
  target_not_found: 'target_not_found',
  target_not_confirmed: 'target_not_confirmed',
  target_inactive: 'target_inactive',
  rate_limited: 'rate_limited',
  domain_exists: 'domain_exists',
  import_pending: 'import_pending',
  second_admin_required: 'second_admin_required',
  request_not_found: 'request_not_found',
  request_closed: 'request_closed',
  idempotency_conflict: 'idempotency_conflict',
  registrar_unavailable: 'registrar_unavailable',
}

type RegistrarSnapshot = RegistrarImportPreview & { providerDomainId: string; tld: string }
type RpcResult = {
  ok?: boolean
  code?: string
  status?: 'pending_approval' | 'imported' | 'rejected'
  request_id?: string
  domain?: string
  order_id?: string
  custom_domain_id?: string
  requires_second_admin?: boolean
  replayed?: boolean
}

function errorFromCode(code: string | undefined): AdminDomainImportError {
  return (code && ERROR_CODES[code]) || 'unavailable'
}

function normalizeRegistrarNameservers(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((name) => name.trim().toLowerCase().replace(/\.+$/, ''))
        .filter((name) => name.length > 0 && name.length <= 253 && /^[a-z0-9.-]+$/.test(name)),
    ),
  ).slice(0, 13)
}

/**
 * Strict zone-named instant first; only when the registrar sent a zone-less
 * value is it read as Europe/Istanbul. This fallback is import/display-only:
 * renewal verification keeps using the strict parser.
 */
function resolveImportExpiry(
  details: Pick<ManagedDomainDetails, 'expiresAt' | 'expiresAtRaw'>,
): { expiresAt: string; source: ExpiresAtSource } | null {
  if (details.expiresAt) {
    const strict = new Date(details.expiresAt)
    if (Number.isFinite(strict.getTime())) return { expiresAt: strict.toISOString(), source: 'provider_explicit' }
  }
  const assumed = parseProviderDateAssumingIstanbul(details.expiresAtRaw)
  if (assumed.instant && assumed.source) return { expiresAt: assumed.instant, source: assumed.source }
  return null
}

const DATE_LIKE_FIELD = /date|expir|start|end|renew|creat|updat|time|day/i

/** Logs which raw reply fields exist (names only) so a new date field name is discoverable. No values. */
function logExpiryUnavailable(details: ManagedDomainDetails) {
  const fieldNames = details.rawFieldNames ?? []
  console.warn('[admin-domain-import] expiry_unavailable', {
    rawFieldNames: fieldNames,
    dateLikeFieldNames: fieldNames.filter((name) => DATE_LIKE_FIELD.test(name)),
    hadExpiresAtRaw: Boolean(details.expiresAtRaw),
  })
}

async function readOwnedRegistrarDomain(rawDomain: string): Promise<RegistrarSnapshot | AdminDomainImportError> {
  const normalizedInput = normalizeDomain(rawDomain)
  if (!normalizedInput.ok) return 'invalid_domain'
  const domain = normalizedInput.domain

  const registrar = getDomainRegistrarProvider()
  if (!registrar || registrar.id !== 'domainnameapi' || !registrar.live || !isManageCapable(registrar)) {
    return 'registrar_unavailable'
  }

  let details
  try {
    // GetDetails is intentionally the only registrar operation used here. It is
    // account-scoped, read-only, and does not fetch or change WHOIS contacts.
    details = await registrar.getManagedDetails(domain)
  } catch {
    return 'registrar_unavailable'
  }
  if (!details) return 'domain_not_owned'

  const returnedDomain = normalizeDomain(details.domain)
  if (!returnedDomain.ok || returnedDomain.domain !== domain) return 'domain_not_owned'
  if (details.status.trim().toLowerCase() !== 'active') return 'domain_not_active'

  const expiry = resolveImportExpiry(details)
  if (!expiry) {
    logExpiryUnavailable(details)
    return 'expiry_unavailable'
  }
  if (new Date(expiry.expiresAt).getTime() <= Date.now()) return 'domain_expired'

  const purchase = parsePurchaseDomain(domain)
  if (!purchase) return 'invalid_domain'

  return {
    domain,
    expiresAt: expiry.expiresAt,
    expiresAtSource: expiry.source,
    nameservers: normalizeRegistrarNameservers(details.nameservers),
    // DomainNameAPI addresses its account operations by the canonical domain
    // string; that is the provider identifier used by the existing order flow.
    providerDomainId: returnedDomain.domain,
    tld: purchase.tld,
  }
}

export async function previewRegistrarDomainImport(
  rawDomain: string,
): Promise<PreviewAdminDomainImportResult> {
  const normalized = normalizeDomain(rawDomain)
  if (!normalized.ok) return { ok: false, error: 'invalid_domain' }

  const result = await readOwnedRegistrarDomain(normalized.domain)
  if (typeof result === 'string') return { ok: false, error: result }
  return {
    ok: true,
    preview: {
      domain: result.domain,
      expiresAt: result.expiresAt,
      expiresAtSource: result.expiresAtSource,
      nameservers: result.nameservers,
    },
  }
}

export async function requestRegistrarDomainImport(input: {
  domain: string
  targetEmail: string
  reason: string
  idempotencyKey: string
  actor: { userId: string; email: string }
}): Promise<AdminDomainImportResult> {
  const normalized = normalizeDomain(input.domain)
  if (!normalized.ok) return { ok: false, error: 'invalid_domain' }

  const targetEmail = input.targetEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || targetEmail.length > 254) {
    return { ok: false, error: 'invalid_email' }
  }
  const reason = input.reason.trim()
  if (reason.length < 3 || reason.length > 1000) return { ok: false, error: 'reason_required' }
  if (!/^[a-zA-Z0-9:_-]{8,80}$/.test(input.idempotencyKey)) {
    return { ok: false, error: 'idempotency_conflict' }
  }

  const target = await lookupTargetByEmail(targetEmail)
  if (!target) return { ok: false, error: 'target_not_found' }
  if (target.deleted) return { ok: false, error: 'target_not_found' }
  if (!target.confirmed) return { ok: false, error: 'target_not_confirmed' }
  if (target.banned) return { ok: false, error: 'target_inactive' }

  const snapshot = await readOwnedRegistrarDomain(normalized.domain)
  if (typeof snapshot === 'string') return { ok: false, error: snapshot }

  const token = newVerificationToken()
  const initialDns = buildDnsRecords({
    domain: snapshot.domain,
    token,
    existing: placeholderDns(snapshot.domain),
    ownershipVerified: true,
  })

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_request_domain_import', {
    p_domain: snapshot.domain,
    p_tld: snapshot.tld,
    p_target_user_id: target.id,
    p_target_email: targetEmail,
    p_requested_by_user_id: input.actor.userId,
    p_requested_by_email: input.actor.email.trim().toLowerCase(),
    p_reason: reason,
    p_idempotency_key: input.idempotencyKey,
    p_provider_domain_id: snapshot.providerDomainId,
    p_expires_at: snapshot.expiresAt,
    p_registrar_nameservers: snapshot.nameservers,
    p_initial_dns: initialDns,
    p_verification_token: token,
  })

  if (error) {
    return { ok: false, error: error.code === '23505' ? 'domain_exists' : 'unavailable' }
  }
  return mapRpcResult(data as RpcResult | null)
}

async function loadPendingRequest(requestId: string): Promise<PendingAdminDomainImport | null> {
  const { data, error } = await createAdminClient()
    .from('domain_import_requests')
    .select('id, domain, target_email, requested_by_email, reason, created_at, expires_at, registrar_nameservers')
    .eq('id', requestId)
    .eq('status', 'pending_approval')
    .maybeSingle()

  if (error || !data) return null
  return {
    id: String(data.id),
    domain: String(data.domain),
    targetEmail: String(data.target_email),
    requestedByEmail: String(data.requested_by_email),
    reason: String(data.reason),
    createdAt: String(data.created_at),
    expiresAt: String(data.expires_at),
    nameservers: normalizeRegistrarNameservers(data.registrar_nameservers as string[] | null),
  }
}

export async function approveRegistrarDomainImport(input: {
  requestId: string
  actor: { userId: string; email: string }
}): Promise<AdminDomainImportResult> {
  const pending = await loadPendingRequest(input.requestId)
  if (!pending) return { ok: false, error: 'request_not_found' }

  const snapshot = await readOwnedRegistrarDomain(pending.domain)
  if (typeof snapshot === 'string') return { ok: false, error: snapshot }

  const { data, error } = await createAdminClient().rpc('admin_approve_domain_import', {
    p_request_id: pending.id,
    p_actor_user_id: input.actor.userId,
    p_actor_email: input.actor.email.trim().toLowerCase(),
    p_provider_domain_id: snapshot.providerDomainId,
    p_expires_at: snapshot.expiresAt,
    p_registrar_nameservers: snapshot.nameservers,
  })
  if (error) return { ok: false, error: error.code === '23505' ? 'domain_exists' : 'unavailable' }
  return mapRpcResult(data as RpcResult | null)
}

export async function rejectRegistrarDomainImport(input: {
  requestId: string
  actor: { userId: string; email: string }
  note: string
}): Promise<{ ok: true } | { ok: false; error: AdminDomainImportError }> {
  const note = input.note.trim()
  if (note.length < 3 || note.length > 1000) return { ok: false, error: 'reason_required' }

  const { data, error } = await createAdminClient().rpc('admin_reject_domain_import', {
    p_request_id: input.requestId,
    p_actor_user_id: input.actor.userId,
    p_actor_email: input.actor.email.trim().toLowerCase(),
    p_decision_note: note,
  })
  if (error) return { ok: false, error: 'unavailable' }
  const result = data as RpcResult | null
  if (result?.ok) return { ok: true }
  return { ok: false, error: errorFromCode(result?.code) }
}

export async function listPendingRegistrarDomainImports(): Promise<PendingAdminDomainImportsResult> {
  const { data, error } = await createAdminClient()
    .from('domain_import_requests')
    .select('id, domain, target_email, requested_by_email, reason, created_at, expires_at, registrar_nameservers')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) return { ready: false, items: [] }
  return {
    ready: true,
    items: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      domain: String(row.domain),
      targetEmail: String(row.target_email),
      requestedByEmail: String(row.requested_by_email),
      reason: String(row.reason),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      nameservers: normalizeRegistrarNameservers(row.registrar_nameservers as string[] | null),
    })),
  }
}

function mapRpcResult(result: RpcResult | null): AdminDomainImportResult {
  if (!result?.ok) return { ok: false, error: errorFromCode(result?.code) }
  if (result.status !== 'pending_approval' && result.status !== 'imported') {
    return { ok: false, error: 'unavailable' }
  }
  if (!result.request_id || !result.domain) return { ok: false, error: 'unavailable' }

  return {
    ok: true,
    status: result.status,
    requestId: result.request_id,
    domain: result.domain,
    orderId: result.order_id,
    customDomainId: result.custom_domain_id,
    requiresSecondAdmin: Boolean(result.requires_second_admin),
    replayed: Boolean(result.replayed),
  }
}
