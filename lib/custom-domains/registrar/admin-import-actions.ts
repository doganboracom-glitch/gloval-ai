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
  return requestRegistrarDomainImport({ ...input, actor: { userId: actor.userId, email: actor.email } })
}

export async function approveRegistrarDomainImportAction(
  requestId: string,
): Promise<AdminDomainImportResult> {
  const actor = await requireAdmin()
  const rate = await guardRateLimit(actor.userId, 'decide')
  if (rate !== 'ok') return { ok: false, error: rate === 'rate_limited' ? 'rate_limited' : 'unavailable' }
  return approveRegistrarDomainImport({ requestId, actor: { userId: actor.userId, email: actor.email } })
}

export async function rejectRegistrarDomainImportAction(input: {
  requestId: string
  note: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAdmin()
  const rate = await guardRateLimit(actor.userId, 'decide')
  if (rate !== 'ok') return { ok: false, error: rate === 'rate_limited' ? 'rate_limited' : 'unavailable' }
  return rejectRegistrarDomainImport({
    ...input,
    actor: { userId: actor.userId, email: actor.email },
  })
}
