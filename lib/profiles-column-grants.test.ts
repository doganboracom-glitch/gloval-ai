import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const migrationSource = read('scripts/084-profiles-column-grants.sql')
const rollbackSource = read('scripts/084-profiles-column-grants.rollback.sql')
const forwardSection = migrationSource.match(
  /-- START FORWARD MIGRATION([\s\S]*?)-- END FORWARD MIGRATION/i,
)?.[1] ?? ''
const forwardSql = forwardSection
  .replace(/--.*$/gm, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()
const rollbackSql = rollbackSource
  .replace(/--.*$/gm, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

function sourceFiles(directory: string): string[] {
  const absolute = join(root, directory)
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = join(absolute, entry.name)
    if (entry.isDirectory()) return sourceFiles(relative(root, path))
    if (
      !entry.isFile() ||
      !/\.(?:[jt]sx?|mjs|cjs)$/.test(entry.name) ||
      /\.(?:test|spec)\.(?:[jt]sx?|mjs|cjs)$/.test(entry.name)
    ) return []
    return [path]
  })
}

function profileWriters() {
  const mutations: Array<{ file: string; method: string }> = []
  const mutationPattern = /\.from\(\s*(['"])profiles\1\s*\)\s*\.\s*(insert|upsert|update|delete)\s*\(/g

  for (const path of ['app', 'components', 'lib'].flatMap(sourceFiles)) {
    const code = readFileSync(path, 'utf8')
    const file = relative(root, path).replaceAll('\\', '/')
    for (const match of code.matchAll(mutationPattern)) {
      mutations.push({ file, method: match[2] })
    }
  }

  return mutations.sort((a, b) => `${a.file}:${a.method}`.localeCompare(`${b.file}:${b.method}`))
}

describe('084 profiles grants migration', () => {
  it('removes client table/column ACLs and grants only the authenticated allowlist', () => {
    expect(forwardSection).not.toBe('')
    expect(forwardSql).toContain(
      'revoke all privileges on table public.profiles from public, anon, authenticated;',
    )
    expect(forwardSql).toContain(
      'revoke all privileges (id, email, full_name, created_at, status, password_reset_blocked_until, password_reset_security_version) on table public.profiles from public, anon, authenticated;',
    )
    expect(forwardSql).toContain(
      'grant all privileges on table public.profiles to service_role;',
    )

    const authenticatedGrants = Array.from(
      forwardSql.matchAll(/grant\s+([^;]+?)\s+on table public\.profiles to authenticated;/g),
      (match) => match[1],
    )
    expect(authenticatedGrants).toEqual([
      'select (id, full_name, status)',
      'update (full_name)',
    ])
  })

  it('adds the owner WITH CHECK without replacing unrelated RLS policies', () => {
    expect(forwardSql).toContain(
      'alter policy profiles_update_own on public.profiles using (auth.uid() = id) with check (auth.uid() = id);',
    )
    expect(forwardSql).not.toMatch(/\b(?:create|drop)\s+policy\b/)
    expect(forwardSql).not.toMatch(/\b(?:create|drop)\s+(?:function|trigger)\b/)
  })

  it('includes read-only pre/post checks, signup-trigger inspection, and manual smoke tests', () => {
    expect(migrationSource).toMatch(/PRE-APPLY READ-ONLY CHECKS/i)
    expect(migrationSource).toMatch(/POST-APPLY READ-ONLY CHECKS/i)
    expect(migrationSource).toMatch(/information_schema\.table_privileges/i)
    expect(migrationSource).toMatch(/has_column_privilege/i)
    expect(migrationSource).toMatch(/pg_policies/i)
    expect(migrationSource).toMatch(/auth\.users/i)
    expect(migrationSource).toMatch(/MANUAL SMOKE TESTS[\s\S]*Google OAuth[\s\S]*forgot-password[\s\S]*suspend/i)
    expect(migrationSource).toMatch(/ROLLBACK SQL[\s\S]*GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.profiles TO authenticated/i)
  })

  it('keeps the rollback aligned with the verified pre-migration grants', () => {
    expect(rollbackSql).toContain('grant select on table public.profiles to anon;')
    expect(rollbackSql).toContain(
      'grant select, insert, update, delete on table public.profiles to authenticated;',
    )
    expect(rollbackSql).toContain('grant all privileges on table public.profiles to service_role;')
    expect(rollbackSql).toContain('drop policy if exists profiles_update_own on public.profiles;')
    expect(rollbackSql).toContain(
      'create policy profiles_update_own on public.profiles for update to public using (auth.uid() = id);',
    )
  })
})

describe('profiles application write paths', () => {
  it('keeps direct profile mutations limited to the authenticated name and service-role admin/reset paths', () => {
    expect(profileWriters()).toEqual([
      { file: 'app/api/auth/forgot-password/route.ts', method: 'update' },
      { file: 'app/api/auth/forgot-password/route.ts', method: 'update' },
      { file: 'app/api/auth/forgot-password/route.ts', method: 'update' },
      { file: 'app/api/draft-reminders/unsubscribe/route.ts', method: 'update' },
      { file: 'lib/account.ts', method: 'update' },
      { file: 'lib/admin/actions.ts', method: 'update' },
      { file: 'lib/heard-from-actions.ts', method: 'update' },
    ])

    const heardFromSource = read('lib/heard-from-actions.ts')
    expect(heardFromSource).toMatch(/\.update\(\{\s*heard_from:\s*value\s*\}\)\s*\.eq\('id',\s*user\.id\)/)
    expect(heardFromSource).not.toMatch(/createAdminClient/)

    const accountSource = read('lib/account.ts')
    const ownProfileAction = accountSource.match(/export async function updateOwnProfile[\s\S]*?\n}/)?.[0] ?? ''
    expect(ownProfileAction).toMatch(/getRequestUser\(\)/)
    expect(ownProfileAction).toMatch(
      /supabase\.from\('profiles'\)\.update\(\{\s*full_name:\s*fullName\s*\}\)\.eq\('id',\s*user\.id\)/,
    )
    expect(ownProfileAction).not.toMatch(/\b(?:status|email|password_reset_blocked_until|password_reset_security_version)\s*:/)

    const adminSource = read('lib/admin/actions.ts')
    const statusAction = adminSource.match(/export async function setUserStatus\([\s\S]*?\n}/)?.[0] ?? ''
    expect(statusAction).toMatch(/await requireAdmin\(\)/)
    expect(statusAction).toMatch(/const admin = createAdminClient\(\)/)
    expect(statusAction).toMatch(/admin\.from\('profiles'\)\.update\(\{\s*status\s*\}\)/)

    const resetSource = read('app/api/auth/forgot-password/route.ts')
    expect(resetSource).toMatch(/const admin = createAdminClient\(\)/)
    expect(resetSource).toMatch(/admin\.from\('profiles'\)\.update\(\{\s*password_reset_blocked_until:/)

    const unsubscribeSource = read('app/api/draft-reminders/unsubscribe/route.ts')
    expect(unsubscribeSource).toMatch(/import \{ createAdminClient \} from '@\/lib\/supabase\/admin'/)
    expect(unsubscribeSource).toMatch(
      /await createAdminClient\(\)\s*\.from\('profiles'\)\s*\.update\(\{\s*draft_reminders_opt_out:\s*true,\s*draft_reminders_opt_out_at:/,
    )
    expect(unsubscribeSource).toMatch(/verifyOptOutToken\(token\)/)
    expect(unsubscribeSource).toMatch(/origin !== new URL\(request\.url\)\.origin/)
  })
})
