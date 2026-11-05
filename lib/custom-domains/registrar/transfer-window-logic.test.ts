import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  getRegistrarTransferState,
  initialTransferRelockAt,
  isTransferWindowExpired,
  nextPendingTransferRelockAt,
  nextTransferExtensionAt,
  TRANSFER_WINDOW_MAX_EXTENSIONS,
  TRANSFER_WINDOW_MAX_RELOCK_ATTEMPTS,
  TRANSFER_WINDOW_MAX_MS,
  TRANSFER_WINDOW_MS,
} from './transfer-window-logic'

const day = 24 * 60 * 60 * 1000
const openedAt = Date.parse('2026-01-01T00:00:00.000Z')

function windowRecord(extensions = 0, relockOffsetMs = TRANSFER_WINDOW_MS) {
  return {
    opened_at: new Date(openedAt).toISOString(),
    relock_at: new Date(openedAt + relockOffsetMs).toISOString(),
    extensions,
  }
}

describe('registrar transfer state', () => {
  it('recognizes DomainNameAPI status 11 as an outgoing transfer in progress', () => {
    expect(getRegistrarTransferState(11)).toBe('pending_outgoing')
    expect(getRegistrarTransferState('WaitingForOutgoingTransfer')).toBe('pending_outgoing')
  })

  it('recognizes a held domain, a completed transfer, and an unreadable status', () => {
    expect(getRegistrarTransferState('Active')).toBe('held')
    expect(getRegistrarTransferState('TransferredOut')).toBe('transferred_out')
    expect(getRegistrarTransferState('provider changed its response')).toBe('unknown')
  })
})

describe('transfer window timing', () => {
  it('opens a 72-hour window and limits extensions to two and seven total days', () => {
    expect(initialTransferRelockAt(openedAt)).toBe(new Date(openedAt + TRANSFER_WINDOW_MS).toISOString())
    expect(TRANSFER_WINDOW_MAX_EXTENSIONS).toBe(2)

    const first = nextTransferExtensionAt(windowRecord(0), openedAt + 1)
    expect(first).toBe(new Date(openedAt + 6 * day).toISOString())

    const second = nextTransferExtensionAt(
      { ...windowRecord(1), relock_at: first ?? windowRecord(1).relock_at },
      openedAt + 1,
    )
    expect(second).toBe(new Date(openedAt + TRANSFER_WINDOW_MAX_MS).toISOString())
    expect(nextTransferExtensionAt({ ...windowRecord(2), relock_at: second ?? '' }, openedAt + 1)).toBeNull()
  })

  it('defers a pending transfer in 24-hour steps without exceeding seven days', () => {
    const scheduled = openedAt + TRANSFER_WINDOW_MS
    expect(nextPendingTransferRelockAt(windowRecord(), scheduled)).toBe(
      new Date(scheduled + day).toISOString(),
    )

    const lastAllowed = openedAt + 6 * day
    expect(
      nextPendingTransferRelockAt(
        { opened_at: new Date(openedAt).toISOString(), relock_at: new Date(lastAllowed).toISOString() },
        lastAllowed,
      ),
    ).toBe(new Date(openedAt + TRANSFER_WINDOW_MAX_MS).toISOString())

    expect(
      nextPendingTransferRelockAt(
        {
          opened_at: new Date(openedAt).toISOString(),
          relock_at: new Date(openedAt + TRANSFER_WINDOW_MAX_MS).toISOString(),
        },
        openedAt + TRANSFER_WINDOW_MAX_MS,
      ),
    ).toBeNull()
  })

  it('marks invalid or elapsed deadlines as expired and caps relock retries at five', () => {
    expect(isTransferWindowExpired(new Date(openedAt + 1).toISOString(), openedAt + 1)).toBe(true)
    expect(isTransferWindowExpired('invalid-date', openedAt)).toBe(true)
    expect(TRANSFER_WINDOW_MAX_RELOCK_ATTEMPTS).toBe(5)
  })
})

describe('unapplied migration guardrails', () => {
  it('defines the service-only, concurrency-safe transfer window table and claim function', () => {
    const sql = readFileSync(new URL('../../../scripts/112-domain-transfer-windows.sql', import.meta.url), 'utf8')

    expect(sql).toMatch(/create table if not exists public\.domain_transfer_windows/i)
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/grant select, insert, update/i)
    expect(sql).toMatch(/revoke\s+(?:truncate\s*,\s*delete|delete\s*,\s*truncate)/i)
    expect(sql).toMatch(/for update\s+skip locked/i)
    expect(sql).toMatch(/greatest\s*\(\s*1\s*,\s*least\s*\(\s*coalesce\s*\(\s*p_limit/i)
  })
})
