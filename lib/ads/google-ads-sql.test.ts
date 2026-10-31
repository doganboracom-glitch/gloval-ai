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
  it('adds the Google Ads connection metadata columns', async () => {
    const { rows } = await db.query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'ads_connections'
    `)
    const columns = new Set(rows.map((row) => row.column_name))

    expect(columns.has('currency_code')).toBe(true)
    expect(columns.has('is_manager')).toBe(true)
    expect(columns.has('api_lease_id')).toBe(true)
    expect(columns.has('api_lease_expires_at')).toBe(true)
  })

  it('enables RLS and grants only service_role direct table and RPC access', async () => {
    const { rows: rlsRows } = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity
      from pg_class
      where oid in (
        'public.ads_google_oauth_flows'::regclass,
        'public.ads_google_api_operations'::regclass
      )
      order by relname
    `)
    expect(rlsRows).toHaveLength(2)
    expect(rlsRows.every((row) => row.relrowsecurity)).toBe(true)

    const { rows: grants } = await db.query<{
      anon_flow: boolean
      auth_flow: boolean
      service_flow: boolean
      anon_operations: boolean
      auth_operations: boolean
      service_operations: boolean
      anon_rpc: boolean
      auth_rpc: boolean
      service_rpc: boolean
    }>(`
      select
        has_table_privilege('anon', 'public.ads_google_oauth_flows', 'select') as anon_flow,
        has_table_privilege('authenticated', 'public.ads_google_oauth_flows', 'select') as auth_flow,
        has_table_privilege('service_role', 'public.ads_google_oauth_flows', 'select') as service_flow,
        has_table_privilege('anon', 'public.ads_google_api_operations', 'select') as anon_operations,
        has_table_privilege('authenticated', 'public.ads_google_api_operations', 'select') as auth_operations,
        has_table_privilege('service_role', 'public.ads_google_api_operations', 'select') as service_operations,
        has_function_privilege('anon', 'public.ads_reserve_google_api_operation(uuid,uuid,uuid,text)', 'execute') as anon_rpc,
        has_function_privilege('authenticated', 'public.ads_reserve_google_api_operation(uuid,uuid,uuid,text)', 'execute') as auth_rpc,
        has_function_privilege('service_role', 'public.ads_reserve_google_api_operation(uuid,uuid,uuid,text)', 'execute') as service_rpc
    `)
    expect(grants[0]).toEqual({
      anon_flow: false,
      auth_flow: false,
      service_flow: true,
      anon_operations: false,
      auth_operations: false,
      service_operations: true,
      anon_rpc: false,
      auth_rpc: false,
      service_rpc: true,
    })

    const { rows: functionGrants } = await db.query<{
      anon_execute: boolean
      authenticated_execute: boolean
      service_execute: boolean
    }>(`
      select
        bool_and(not has_function_privilege('anon', p.oid, 'execute')) as anon_execute,
        bool_and(not has_function_privilege('authenticated', p.oid, 'execute')) as authenticated_execute,
        bool_and(has_function_privilege('service_role', p.oid, 'execute')) as service_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'ads_%'
    `)
    expect(functionGrants[0]).toEqual({ anon_execute: true, authenticated_execute: true, service_execute: true })
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
