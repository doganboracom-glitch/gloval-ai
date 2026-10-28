import { createHash } from 'node:crypto'

/**
 * The "GLV-XXXXXX" number customers already see in emails and notifications.
 * Same algorithm as `formatTicketNumber` in `lib/notify.ts` (kept separate
 * because that module is server-only and pulls in the mail stack); a test
 * pins the two together so they cannot drift.
 */
export function transactionNumber(reference: string): string {
  const hash = createHash('sha256').update(reference).digest('hex')
  const short = BigInt(`0x${hash.slice(0, 12)}`).toString(36).toUpperCase().padStart(6, '0').slice(-6)
  return `GLV-${short}`
}

/** The reference a payment was announced under: the provider reference when there is one, else the row id. */
export function transactionNumberFor(tx: { id: string; provider_ref: string | null }): string {
  return transactionNumber(tx.provider_ref ?? tx.id)
}
