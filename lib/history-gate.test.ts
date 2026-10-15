import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canUseVersionHistory } from '@/lib/pricing-config'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('version history gate (UI wiring)', () => {
  it('is closed for Free and Starter, open for Pro and E-Commerce', () => {
    expect(canUseVersionHistory('free')).toBe(false)
    expect(canUseVersionHistory('starter')).toBe(false)
    expect(canUseVersionHistory('pro')).toBe(true)
    expect(canUseVersionHistory('ecommerce')).toBe(true)
  })

  it('the editor page only loads history data when the plan allows it', () => {
    const page = read('app/editor/[projectId]/page.tsx')
    expect(page).toMatch(/const historyEnabled = canUseVersionHistory\(planCode\)/)
    expect(page).toMatch(/historyEnabled\s*\?\s*await Promise\.all\(\[\s*listProjectVersions[\s\S]*?\]\)\s*:\s*\[\[\], \[\]\]/)
  })

  it('the editor client only passes list/restore handlers when history is enabled', () => {
    const client = read('components/editor/editor-client.tsx')
    expect(client).toMatch(/\.\.\.\(historyEnabled\s*\?\s*\{[\s\S]*?restoreBackup[\s\S]*?\}\s*:\s*\{\}\)/)
  })

  it('the panel shows the history tab only when a versions list was provided', () => {
    const panel = read('components/website-editor-panel.tsx')
    expect(panel).toMatch(/const historyEnabled = versions !== null/)
    expect(panel).toMatch(/\{historyEnabled && \(/)
    expect(panel).toMatch(/tab === 'history' && historyEnabled/)
  })
})

describe('project_backups RLS (migration 062)', () => {
  const sql = read('scripts/062-project-backups.sql')

  it('enables RLS and revokes direct table access from anon and authenticated', () => {
    expect(sql).toMatch(/alter table public\.project_backups enable row level security/i)
    expect(sql).toMatch(/revoke all on public\.project_backups from anon, authenticated/i)
  })

  it('grants authenticated SELECT only, never write', () => {
    expect(sql).toMatch(/grant select on public\.project_backups to authenticated/i)
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*project_backups[^;]*to\s+(anon|authenticated)/i)
    expect(sql).not.toMatch(/grant[^;]*to\s+anon/i)
  })

  it('the only policy limits reads to the project owner', () => {
    const policies = sql.match(/create policy[\s\S]*?;/gi) ?? []
    expect(policies).toHaveLength(1)
    expect(policies[0]).toMatch(/for select to authenticated/i)
    expect(policies[0]).toMatch(/p\.owner_id = auth\.uid\(\)/)
    expect(policies[0]).toMatch(/p\.id = project_backups\.project_id/)
  })

  it('the prune function is callable by service_role only', () => {
    expect(sql).toMatch(/revoke all on function public\.prune_stale_project_versions[^;]*from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.prune_stale_project_versions[^;]*to service_role/i)
  })
})
