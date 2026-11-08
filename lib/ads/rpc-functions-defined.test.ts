import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..')
const SOURCE_DIRS = ['lib', 'app', 'components']
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.git'])

function walk(dir: string, accept: (file: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, accept, out)
    else if (accept(full)) out.push(full)
  }
  return out
}

function isProductionSource(file: string): boolean {
  return /\.(ts|tsx)$/.test(file) && !/\.(test|spec)\.(ts|tsx)$/.test(file)
}

function collectRpcNames(): Map<string, string[]> {
  const names = new Map<string, string[]>()
  const pattern = /\.rpc\(\s*['"`]([a-z0-9_]+)['"`]/g
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(path.join(ROOT, dir), isProductionSource)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(pattern)) {
        const list = names.get(match[1]) ?? []
        list.push(path.relative(ROOT, file))
        names.set(match[1], list)
      }
    }
  }
  return names
}

function collectDefinedFunctions(): Set<string> {
  const defined = new Set<string>()
  const pattern = /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(/gi
  for (const file of walk(path.join(ROOT, 'scripts'), (f) => f.endsWith('.sql'))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(pattern)) defined.add(match[1].toLowerCase())
  }
  return defined
}

describe('Supabase RPC adları scripts/*.sql ile uyumlu', () => {
  const called = collectRpcNames()
  const defined = collectDefinedFunctions()

  it('kodda en az bir ads_* RPC çağrısı bulunur', () => {
    expect([...called.keys()].filter((name) => name.startsWith('ads_')).length).toBeGreaterThan(0)
  })

  it('yayın başlatma RPC adı canlıdaki _e2 fonksiyonuyla eşleşir', () => {
    expect(called.has('ads_begin_google_ads_publish_e2')).toBe(true)
    expect(called.has('ads_begin_google_ads_publish_v2')).toBe(false)
  })

  it('kodda çağrılan her ads_* fonksiyonu SQL dosyalarında tanımlıdır', () => {
    const missing = [...called.entries()]
      .filter(([name]) => name.startsWith('ads_') && !defined.has(name))
      .map(([name, files]) => `${name} (${[...new Set(files)].join(', ')})`)
    expect(missing).toEqual([])
  })

  it('kodda çağrılan diğer ilgili (ads ile ilişkili) fonksiyonlar SQL dosyalarında tanımlıdır', () => {
    const related = ['reserve_ads_free_actions', 'release_ads_free_actions']
    const missing = related.filter((name) => called.has(name) && !defined.has(name))
    expect(missing).toEqual([])
  })

  it('Meta RPC fonksiyonları 126 numaralı SQL dosyasında tanımlı ve kodda çağrılır', () => {
    const metaFunctions = [
      'ads_reserve_meta_api_operation',
      'ads_save_meta_connection_with_limit',
      'ads_revoke_meta_user_connections',
      'ads_meta_api_calls_15d',
    ]
    expect(metaFunctions.filter((name) => !defined.has(name))).toEqual([])
    expect(metaFunctions.filter((name) => !called.has(name))).toEqual([])
  })

  it('Meta yayın RPC fonksiyonları 127 numaralı SQL dosyasında tanımlı ve kodda çağrılır', () => {
    const publishFunctions = ['ads_approve_meta_plan', 'ads_reserve_meta_publish_capacity', 'ads_finish_meta_publish']
    const source = readFileSync(path.join(ROOT, 'scripts', '127-ads-meta-publish.sql'), 'utf8')
    expect(publishFunctions.filter((name) => !new RegExp(`function\\s+public\\.${name}\\s*\\(`, 'i').test(source))).toEqual([])
    // Capacity reservation and finishing are now reached through the credit-aware 131 wrappers.
    expect(called.has('ads_approve_meta_plan')).toBe(true)
  })

  it('Meta yayın kredi RPC fonksiyonları 131 numaralı SQL dosyasında tanımlı ve kodda çağrılır', () => {
    const creditFunctions = [
      'ads_meta_publish_credit_balance',
      'ads_reserve_meta_publish_credits',
      'ads_settle_meta_publish_credit',
      'ads_finish_meta_publish_v2',
    ]
    const source = readFileSync(path.join(ROOT, 'scripts', '131-ads-meta-publish-credits.sql'), 'utf8')
    expect(creditFunctions.filter((name) => !new RegExp(`function\\s+public\\.${name}\\s*\\(`, 'i').test(source))).toEqual([])
    expect(creditFunctions.filter((name) => !called.has(name))).toEqual([])
  })

  it('Meta yönetim RPC fonksiyonları 128 numaralı SQL dosyasında tanımlı ve kodda çağrılır', () => {
    const manageFunctions = ['ads_reserve_meta_manage_action', 'ads_finish_meta_manage_action', 'ads_sync_meta_plan_state']
    const source = readFileSync(path.join(ROOT, 'scripts', '128-ads-meta-manage.sql'), 'utf8')
    expect(manageFunctions.filter((name) => !new RegExp(`function\\s+public\\.${name}\\s*\\(`, 'i').test(source))).toEqual([])
    expect(manageFunctions.filter((name) => !defined.has(name))).toEqual([])
    expect(manageFunctions.filter((name) => !called.has(name))).toEqual([])
  })

  it('yönetim RPC fonksiyonları yalnızca beklenen rota dosyalarından çağrılır', () => {
    expect(called.get('ads_reserve_meta_manage_action')?.map((file) => file.replace(/\\/g, '/'))).toEqual(['app/api/ads/meta/plans/manage/route.ts'])
    expect(called.get('ads_finish_meta_manage_action')?.every((file) => file.replace(/\\/g, '/') === 'app/api/ads/meta/plans/manage/route.ts')).toBe(true)
    expect(called.get('ads_sync_meta_plan_state')?.map((file) => file.replace(/\\/g, '/'))).toEqual(['app/api/ads/meta/plans/sync/route.ts'])
  })

  it('M3 uç noktaları hem tablo kısıtında hem kota RPC listesinde yer alır ve kodda kullanılır', () => {
    const source = readFileSync(path.join(ROOT, 'scripts', '128-ads-meta-manage.sql'), 'utf8')
    const endpoints = ['campaign.status', 'adset.status', 'ad.status', 'act.campaigns.update', 'act.adsets.update', 'act.ads.update']
    for (const endpoint of endpoints) {
      expect(source.split(`'${endpoint}'`).length - 1, endpoint).toBeGreaterThanOrEqual(2)
    }
    const managePath = path.join(ROOT, 'lib', 'ads', 'meta-manage.ts')
    const code = readFileSync(managePath, 'utf8')
    for (const endpoint of endpoints) expect(code, endpoint).toContain(`'${endpoint}'`)
  })

  it('senkron fonksiyonu sapmayı meta_status_sync denetim satırı olarak yalnızca bir yerde yazar', () => {
    const source = readFileSync(path.join(ROOT, 'scripts', '128-ads-meta-manage.sql'), 'utf8')
    expect(source.split("'meta_status_sync'").length - 1).toBe(1)
  })

  it('Graph yazma uç noktaları kota RPC\'sinin izin listesinde yer alır', () => {
    const source = readFileSync(path.join(ROOT, 'scripts', '127-ads-meta-publish.sql'), 'utf8')
    const writeEndpoints = ['act.campaigns.create', 'act.adsets.create', 'act.adimages.create', 'act.adcreatives.create', 'act.ads.create']
    // Both the table check constraint and the RPC allow-list must name every write endpoint.
    for (const endpoint of writeEndpoints) {
      expect(source.split(`'${endpoint}'`).length - 1, endpoint).toBeGreaterThanOrEqual(2)
    }
  })
})
