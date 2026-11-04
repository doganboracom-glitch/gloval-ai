'use server'

import { requireAdmin } from '@/lib/mail/admin-guard'
import { identityFor, rpcLimiter } from '@/lib/custom-domains/public-search/limits'
import {
  approveRegistrarDomainImport,
  previewRegistrarDomainImport,
  rejectRegistrarDomainImport,
  requestRegistrarDomainImport,
} from './admin-import-service'
import type { AdminDomainImportResult, PreviewAdminDomainImportResult } from './admin-import-types'

const ACTION_LIMITS = {
  preview: { limit: 12, seconds: 60 },
  request: { limit: 5, seconds: 60 },
  decide: { limit: 8, seconds: 60 },
} as const

async function guardRateLimit(
  userId: string,
  action: keyof typeof ACTION_LIMITS,
): Promise<'ok' | 'rate_limited' | 'unavailable'> {
  const identity = identityFor(userId, null)
  const window = ACTION_LIMITS[action]
  const result = await rpcLimiter.reserve(
    `admin-domain-import:${action}:${identity.key}`,
    window.limit,
    window.seconds,
  )
  if (!result) return 'unavailable'
  return result.allowed ? 'ok' : 'rate_limited'
}

export async function previewRegistrarDomainImportAction(
  domain: string,
): Promise<PreviewAdminDomainImportResult> {
  const actor = await requireAdmin()
  const rate = await guardRateLimit(actor.userId, 'preview')
  if (rate !== 'ok') return { ok: false, error: rate === 'rate_limited' ? 'rate_limited' : 'unavailable' }
  if (typeof domain !== 'string' || domain.length > 300) return { ok: false, error: 'invalid_domain' }
  return previewRegistrarDomainImport(domain)
}

export async function requestRegistrarDomainImportAction(input: {
  domain: string
  targetEmail: string
  reason: string
  idempotencyKey: string
}): Promise<AdminDomainImportResult> {
  const actor = await requireAdmin()
  const rate = await guardRateLimit(actor.userId, 'request')
  if (rate !== 'ok') return { ok: false, error: rate === 'rate_limited' ? 'rate_limited' : 'unavailable' }
  if (!input || typeof input.domain !== 'string' || input.domain.length > 300) {
    return { ok: false, error: 'invalid_domain' }
  }
  if (typeof input.targetEmail !== 'string' || input.targetEmail.length > 254) {
    return { ok: false, error: 'invalid_email' }
  }
  if (typeof input.reason !== 'string' || input.reason.length > 1000) {
    return { ok: false, error: 'reason_required' }
  }
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length > 80) {
    return { ok: false, error: 'idempotency_conflict' }
  }
  return requestRegistrarDomainImport({ ...input, actor: { userId: actor.userId, email: actor.email } })
}

export async function approveRegistrarDomainImportAction(
  requestId: string,
): Promise<AdminDomainImportResult> {
  const actor = await requireAdmin()
  const rate = await guardRateLimit(actor.userId, 'decide')
  if (rate !== 'ok') return { ok: false, error: rate === 'rate_limited' ? 'rate_limited' : 'unavailable' }
  if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return { ok: false, error: 'request_not_found' }
  }
  return approveRegistrarDomainImport({ requestId, actor: { userId: actor.userId, email: actor.email } })
}

export async function rejectRegistrarDomainImportAction(input: {
  requestId: string
  note: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAdmin()
  const rate = await guardRateLimit(actor.userId, 'decide')
  if (rate !== 'ok') return { ok: false, error: rate === 'rate_limited' ? 'rate_limited' : 'unavailable' }
  if (!input || typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.requestId)) {
    return { ok: false, error: 'request_not_found' }
  }
  if (typeof input.note !== 'string' || input.note.length > 1000) {
    return { ok: false, error: 'reason_required' }
  }
  return rejectRegistrarDomainImport({
    ...input,
    actor: { userId: actor.userId, email: actor.email },
  })
}
