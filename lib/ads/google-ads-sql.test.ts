import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIGRATION = readFileSync(path.join(process.cwd(), 'scripts/091-ads-google-readonly.sql'), 'utf8')

let db: PGlite
let userNumber = 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text
    );
    create table public.ads_connections (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      platform text not null,
      external_account_id text not null,
      status text not null,
      refresh_token_enc text,
      token_key_version smallint not null default 1
    );
    grant select (id, user_id, platform, external_account_id)
      on table public.ads_connections to authenticated;
    create function public.ads_test_marker() returns boolean
      language sql immutable as $$ select true $$;
  `)
  await db.exec(MIGRATION)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`
    delete from public.ads_google_api_operations;
    delete from public.ads_google_oauth_flows;
    delete from public.ads_connections;
    delete from auth.users;
  `)
})

async function createUser(): Promise<string> {
  userNumber += 1
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [`google-ads-${userNumber}@test.invalid`],
  )
  return rows[0].id
}

describe('scripts/091-ads-google-readonly.sql', () => {
  it('adds Google Ads connection metadata with a safe manager default', async () => {
    const { rows } = await db.query<{
      column_name: string
      is_nullable: string
      column_default: string | null
    }>(`
      select column_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'ads_connections'
    `)
    const columns = new Map(rows.map((row) => [row.column_name, row]))

    expect(columns.has('currency_code')).toBe(true)
    expect(columns.get('is_manager')).toMatchObject({ is_nullable: 'NO', column_default: 'false' })
    expect(columns.has('api_lease_id')).toBe(true)
    expect(columns.has('api_lease_expires_at')).toBe(true)
  })

  it('enables RLS and grants only service_role direct table and RPC access', async () => {
    const { rows: rlsRows } = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity
      from pg_catalog.pg_class
      where oid in (
        'public.ads_connections'::regclass,
        'public.ads_google_oauth_flows'::regclass,
        'public.ads_google_api_operations'::regclass
      )
      order by relname
    `)
    expect(rlsRows).toHaveLength(3)
    expect(rlsRows.every((row) => row.relrowsecurity)).toBe(true)

    const { rows: tableGrants } = await db.query<{
      role_name: string
      table_name: string
      privilege: string
      granted: boolean
    }>(`
      select roles.role_name, tables.table_name, privileges.privilege,
             has_table_privilege(roles.role_name, tables.table_name, privileges.privilege) as granted
      from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
      cross join (values
        ('public.ads_connections'),
        ('public.ads_google_oauth_flows'),
        ('public.ads_google_api_operations')
      ) as tables(table_name)
      cross join (values ('select'), ('insert'), ('update'), ('delete')) as privileges(privilege)
    `)
    expect(tableGrants).toHaveLength(36)
    for (const grant of tableGrants) {
      expect(grant.granted).toBe(grant.role_name === 'service_role')
    }

    const { rows: connectionColumnGrants } = await db.query<{
      role_name: string
      column_name: string
      granted: boolean
    }>(`
      select roles.role_name, columns.column_name,
             has_column_privilege(roles.role_name, 'public.ads_connections', columns.column_name, 'select') as granted
      from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
      cross join information_schema.columns as columns
      where columns.table_schema = 'public' and columns.table_name = 'ads_connections'
    `)
    expect(connectionColumnGrants.length).toBeGreaterThan(0)
    for (const grant of connectionColumnGrants) {
      expect(grant.granted).toBe(grant.role_name === 'service_role')
    }

    const { rows: functionGrants } = await db.query<{
      anon_execute: boolean
      authenticated_execute: boolean
      service_execute: boolean
    }>(`
      select
        bool_and(not has_function_privilege('anon', p.oid, 'execute')) as anon_execute,
        bool_and(not has_function_privilege('authenticated', p.oid, 'execute')) as authenticated_execute,
        bool_and(has_function_privilege('service_role', p.oid, 'execute')) as service_execute
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'ads_%'
    `)
    expect(functionGrants[0]).toEqual({ anon_execute: true, authenticated_execute: true, service_execute: true })
  })

  it('accepts a credential-free completed OAuth flow state', async () => {
    const userId = await createUser()
    const { rows } = await db.query<{ id: string }>(`
      insert into public.ads_google_oauth_flows (
        user_id, state_hash, status, state_consumed_at, code_verifier_enc, pending_refresh_token_enc
      ) values ($1::uuid, repeat('a', 64), 'completed', now(), null, null)
      returning id
    `, [userId])

    expect(rows).toHaveLength(1)
  })

  it('reserves only approved Google Ads read operations and enforces per-user quotas', async () => {
    const userId = await createUser()
    const { rows } = await db.query<{ allowed: boolean; global_used: number; user_used: number }>(
      `select * from public.ads_reserve_google_api_operation($1::uuid, $2::uuid, null::uuid, $3::text)`,
      ['11111111-1111-4111-8111-111111111111', userId, 'customers.listAccessibleCustomers'],
    )
    expect(rows[0]).toMatchObject({ allowed: true, global_used: 1, user_used: 1 })

    await expect(db.query(
      `select * from public.ads_reserve_google_api_operation($1::uuid, $2::uuid, null::uuid, $3::text)`,
      ['22222222-2222-4222-8222-222222222222', userId, 'googleAds.mutate'],
    )).rejects.toThrow('unsupported Google Ads API method')
  })
})
