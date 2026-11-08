import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BILLING_REMINDER_KINDS } from './billing-reminders-core'

const ROOT = process.cwd()
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8')

const invoiceMigration = read('scripts/080-invoice-ready-email.sql')
const reminderMigration = read('scripts/130-subscription-reminder-emails.sql')
const reminderRollback = read('scripts/130-subscription-reminder-emails.rollback.sql')

// Minimal pre-080 shape of the outbox plus the tables 080 references.
const BASE_SCHEMA = `
create table public.invoices (id uuid primary key default gen_random_uuid());
create table public.invoice_audit (id uuid primary key default gen_random_uuid(), action text);
create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  user_id uuid,
  project_id uuid,
  transition_id uuid,
  created_at timestamptz not null default now(),
  constraint email_events_kind_check check (
    kind in ('account_welcome', 'project_first_published', 'project_unpublished')
  )
);
`

let db: PGlite

const REMINDER = BILLING_REMINDER_KINDS[0]
const ID = '11111111-2222-3333-4444-555555555555'

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(invoiceMigration)
})

afterAll(async () => {
  await db.close()
})

async function insertEvent(
  kind: string,
  extra: Partial<Record<'project_id' | 'transition_id' | 'invoice_id' | 'file_sha256' | 'dedupe_key', string | null>> = {},
) {
  const cols = { project_id: null, transition_id: null, invoice_id: null, file_sha256: null, dedupe_key: null, ...extra }
  return db.query(
    `insert into public.email_events (kind, project_id, transition_id, invoice_id, file_sha256, dedupe_key)
     values ($1, $2, $3, $4, $5, $6)`,
    [kind, cols.project_id, cols.transition_id, cols.invoice_id, cols.file_sha256, cols.dedupe_key],
  )
}

describe('130 migration text', () => {
  it('drops the legacy 080 scope check and recreates it with the legacy arms plus a reminder arm', () => {
    expect(reminderMigration).toContain('drop constraint if exists email_events_scope_check')
    expect(reminderMigration).toContain('add constraint email_events_scope_check check (')
    for (const arm of [
      "kind = 'account_welcome'",
      "kind = 'project_first_published'",
      "kind = 'project_unpublished'",
      "kind = 'invoice_ready'",
    ]) {
      expect(reminderMigration).toContain(arm)
    }
    for (const kind of BILLING_REMINDER_KINDS) expect(reminderMigration).toContain(`'${kind}'`)
    expect(reminderMigration).toMatch(
      /project_id is null and transition_id is null and invoice_id is null\s+and file_sha256 is null and dedupe_key is not null\)/,
    )
  })

  it('rollback restores the exact legacy scope check after deleting reminder rows', () => {
    const deleteAt = reminderRollback.indexOf('delete from public.email_events')
    const restoreAt = reminderRollback.indexOf('add constraint email_events_scope_check')
    expect(deleteAt).toBeGreaterThan(-1)
    expect(restoreAt).toBeGreaterThan(deleteAt)
    const restored = reminderRollback.slice(restoreAt)
    for (const kind of BILLING_REMINDER_KINDS) expect(restored).not.toContain(`'${kind}'`)
  })
})

describe('email_events_scope_check against a real Postgres (PGlite)', () => {
  it('rejects reminder kinds before migration 130 (the reported bug)', async () => {
    await expect(insertEvent(REMINDER, { dedupe_key: 'billing:x:1:renewal_upcoming_7d' })).rejects.toThrow()
  })

  describe('after applying 130', () => {
    beforeAll(async () => {
      await db.exec(reminderMigration)
    })

    it('accepts every reminder kind with only a dedupe key', async () => {
      for (const kind of BILLING_REMINDER_KINDS) {
        await insertEvent(kind, { dedupe_key: `billing:sub:period:${kind}` })
      }
    })

    it('rejects a reminder without a dedupe key', async () => {
      await expect(insertEvent(REMINDER, { dedupe_key: null })).rejects.toThrow()
    })

    it.each(['project_id', 'transition_id', 'invoice_id', 'file_sha256'] as const)(
      'rejects a reminder that carries %s',
      async (column) => {
        const value = column === 'file_sha256' ? 'a'.repeat(64) : ID
        await expect(insertEvent(REMINDER, { dedupe_key: `k:${column}`, [column]: value })).rejects.toThrow()
      },
    )

    it('keeps one reminder per dedupe key', async () => {
      await insertEvent(REMINDER, { dedupe_key: 'billing:dup' })
      await expect(insertEvent(REMINDER, { dedupe_key: 'billing:dup' })).rejects.toThrow()
    })

    it('still enforces the four legacy arms', async () => {
      await insertEvent('account_welcome')
      await expect(insertEvent('account_welcome', { project_id: ID })).rejects.toThrow()
      await insertEvent('project_first_published', { project_id: ID })
      await expect(insertEvent('project_first_published')).rejects.toThrow()
      await insertEvent('project_unpublished', { project_id: ID, transition_id: ID })
      await expect(insertEvent('project_unpublished', { project_id: ID })).rejects.toThrow()
      await db.query(`insert into public.invoices (id) values ($1)`, [ID])
      await insertEvent('invoice_ready', { invoice_id: ID, file_sha256: 'b'.repeat(64), dedupe_key: 'inv:1' })
      await expect(insertEvent('invoice_ready', { invoice_id: ID, dedupe_key: 'inv:2' })).rejects.toThrow()
    })

    it('rollback removes reminders and restores the legacy constraint', async () => {
      await db.exec(reminderRollback)
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.email_events where kind = any($1)`,
        [[...BILLING_REMINDER_KINDS]],
      )
      expect(rows[0].n).toBe(0)
      await expect(insertEvent(REMINDER, { dedupe_key: 'billing:after-rollback' })).rejects.toThrow()
      await insertEvent('account_welcome')
    })
  })
})
