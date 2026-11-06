import 'server-only'

import { createHash } from 'node:crypto'

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) throw new TypeError('Approval payload contains an unsupported value')
    return serialized
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Approval payload contains a non-finite number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    return `{${entries.join(',')}}`
  }
  throw new TypeError('Approval payload contains an unsupported value')
}

export function hashGoogleAdsApprovalPayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex')
}

export function createGoogleAdsPlanApprovalHash(input: {
  userId: string
  planId: string
  planVersion: number
  connectionId: string
  customerId: string
  currency: string
  dailyBudgetMinor: number
  budgetCapMinor: number
  userDailyBudgetCapMinor: number
  plan: unknown
}): string {
  return hashGoogleAdsApprovalPayload({ kind: 'google-ads-plan-v1', ...input })
}

export function createGoogleAdsActionApprovalHash(input: {
  userId: string
  planId: string
  planVersion: number
  connectionId: string
  customerId: string
  action: 'pause' | 'enable' | 'budget' | 'ad_copy' | 'keyword' | 'archive'
  before: unknown
  target: unknown
}): string {
  return hashGoogleAdsApprovalPayload({ kind: 'google-ads-action-v1', ...input })
}
