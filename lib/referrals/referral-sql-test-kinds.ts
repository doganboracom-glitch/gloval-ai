// Mirrors the live PostgreSQL CHECK constraints; keep the fixture values in one place.
export const REFERRAL_PAYOUT_CREDIT_KIND = 'gift' as const

export const AI_CREDIT_TRANSACTION_KINDS = [
  REFERRAL_PAYOUT_CREDIT_KIND,
  'package',
  'adjustment',
  'usage',
] as const

export const BILLING_TRANSACTION_KINDS = [
  'charge',
  'proration_credit',
  'proration_debit',
  'refund',
] as const

function sqlTextList(values: readonly string[]): string {
  return values.map((value) => `'${value.replace(/'/gu, "''")}'`).join(', ')
}

export const AI_CREDIT_TRANSACTION_KIND_SQL = sqlTextList(AI_CREDIT_TRANSACTION_KINDS)
export const BILLING_TRANSACTION_KIND_SQL = sqlTextList(BILLING_TRANSACTION_KINDS)
