import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const MIGRATION = readFileSync(path.join(ROOT, 'scripts/095-referral-core.sql'), 'utf8')
const BASE_SCHEMA = `
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
`

let db: PGlite
let userCounter = 0
let codeCounter = 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(MIGRATION)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`
    delete from public.referral_attributions;
    delete from public.referral_click_dedup;
    delete from public.referral_daily_clicks;
    delete from public.referral_signup_intents;
    delete from public.referral_partners;
    delete from auth.users;
  `)
})

async function newUser(): Promise<string> {
  userCounter += 1
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [`referral-${userCounter}@gloval.test`],
  )
  return rows[0].id
}

async function newPartner(userId: string, status = 'active'): Promise<string> {
  codeCounter += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into public.referral_partners (user_id, referral_code, status)
     values ($1, $2, $3) returning id`,
    [userId, `PARTNER${String(codeCounter).padStart(2, '0')}`, status],
  )
  return rows[0].id
}

describe('scripts/095-referral-core.sql', () => {
  it('limits table and click-RPC privileges to service_role', async () => {
    const { rows } = await db.query<{ rls: boolean; anon_select: boolean; service_select: boolean }>(`
      select
        (select relrowsecurity from pg_class where oid = 'public.referral_partners'::regclass) as rls,
        has_table_privilege('anon', 'public.referral_partners', 'select') as anon_select,
        has_table_privilege('service_role', 'public.referral_partners', 'select') as service_select
    `)
    expect(rows[0]).toEqual({ rls: true, anon_select: false, service_select: true })

    const { rows: functionRows } = await db.query<{ anon_execute: boolean; service_execute: boolean }>(`
      select
        has_function_privilege('anon', 'public.record_referral_click(uuid,text)', 'execute') as anon_execute,
        has_function_privilege('service_role', 'public.record_referral_click(uuid,text)', 'execute') as service_execute
    `)
    expect(functionRows[0]).toEqual({ anon_execute: false, service_execute: true })
  })

  it('deduplicates a partner/day/subject and atomically increments unique clicks once', async () => {
    const ownerId = await newUser()
    const partnerId = await newPartner(ownerId)
    const hash = 'a'.repeat(64)

    const first = await db.query<{ record_referral_click: boolean }>(
      'select public.record_referral_click($1::uuid, $2::text) as record_referral_click',
      [partnerId, hash],
    )
    const duplicate = await db.query<{ record_referral_click: boolean }>(
      'select public.record_referral_click($1::uuid, $2::text) as record_referral_click',
      [partnerId, hash],
    )
    expect(first.rows[0].record_referral_click).toBe(true)
    expect(duplicate.rows[0].record_referral_click).toBe(false)

    const { rows } = await db.query<{ unique_clicks: number; expires_at: string }>(`
      select d.expires_at, c.unique_clicks
      from public.referral_click_dedup d
      join public.referral_daily_clicks c using (partner_id, click_date)
      where d.partner_id = $1 and d.subject_hash = $2
    `, [partnerId, hash])
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].unique_clicks)).toBe(1)
    const ttl = new Date(rows[0].expires_at).getTime() - Date.now()
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })

  it('does not count clicks for paused or ownerless partners', async () => {
    const ownerId = await newUser()
    const partnerId = await newPartner(ownerId, 'paused')
    const result = await db.query<{ record_referral_click: boolean }>(
      'select public.record_referral_click($1::uuid, $2::text) as record_referral_click',
      [partnerId, 'b'.repeat(64)],
    )
    expect(result.rows[0].record_referral_click).toBe(false)

    await db.query('update public.referral_partners set status = $2, user_id = null where id = $1', [partnerId, 'active'])
    const ownerless = await db.query<{ record_referral_click: boolean }>(
      'select public.record_referral_click($1::uuid, $2::text) as record_referral_click',
      [partnerId, 'c'.repeat(64)],
    )
    expect(ownerless.rows[0].record_referral_click).toBe(false)
  })

  it('retains attribution history while deleting auth users and restricts partner deletion', async () => {
    const partnerUserId = await newUser()
    const referredUserId = await newUser()
    const partnerId = await newPartner(partnerUserId)
    await db.query(
      `insert into public.referral_attributions
         (referred_user_id, partner_id, code_snapshot, source, captured_at)
       values ($1, $2, 'PARTNER01', 'email', now())`,
      [referredUserId, partnerId],
    )

    await expect(db.query('delete from public.referral_partners where id = $1', [partnerId])).rejects.toThrow()
    await db.query('delete from auth.users where id = $1', [referredUserId])
    await db.query('delete from auth.users where id = $1', [partnerUserId])

    const { rows } = await db.query<{ referred_user_id: string | null; partner_id: string }>(
      'select referred_user_id, partner_id from public.referral_attributions where partner_id = $1',
      [partnerId],
    )
    expect(rows).toEqual([{ referred_user_id: null, partner_id: partnerId }])
  })
})
