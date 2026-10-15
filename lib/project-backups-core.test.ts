import { describe, expect, it } from 'vitest'
import {
  cadenceForBillingCode,
  canonicalJson,
  changedSinceBackup,
  contentHash,
  excessBackupIds,
  isBackupDue,
  isPruneEnabled,
  keepsVersionHistory,
  selectPrunableVersionIds,
} from '@/lib/project-backups-core'

describe('project backups core', () => {
  it('hashes equal content equally regardless of key order', () => {
    expect(contentHash({ a: 1, b: { c: 2, d: 3 } })).toBe(contentHash({ b: { d: 3, c: 2 }, a: 1 }))
    expect(canonicalJson({ b: 1, a: undefined })).toBe('{"b":1}')
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }))
  })

  it('daily is due once per UTC day, weekly after 7 days', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    expect(isBackupDue('daily', null, now)).toBe(true)
    expect(isBackupDue('daily', '2026-10-15T00:01:00Z', now)).toBe(false)
    expect(isBackupDue('daily', '2026-10-14T23:59:00Z', now)).toBe(true)
    expect(isBackupDue('weekly', '2026-10-09T12:00:01Z', now)).toBe(false)
    expect(isBackupDue('weekly', '2026-10-08T12:00:00Z', now)).toBe(true)
  })

  it('only revisits projects saved after the latest backup', () => {
    expect(changedSinceBackup('2026-10-15T00:00:00Z', null)).toBe(true)
    expect(changedSinceBackup('2026-10-14T00:00:00Z', '2026-10-15T00:00:00Z')).toBe(false)
    expect(changedSinceBackup('2026-10-16T00:00:00Z', '2026-10-15T00:00:00Z')).toBe(true)
  })

  it('prune is enabled only by the exact string true', () => {
    expect(isPruneEnabled('true')).toBe(true)
    for (const v of [undefined, null, '', 'TRUE', '1', 'yes', 'false']) expect(isPruneEnabled(v)).toBe(false)
  })

  it('maps plan codes to a cadence and never guesses from substrings', () => {
    expect(cadenceForBillingCode('free')).toBeNull()
    expect(cadenceForBillingCode('starter')).toBe('weekly')
    expect(cadenceForBillingCode('pro')).toBe('daily')
    expect(cadenceForBillingCode('ecommerce')).toBe('daily')
    expect(cadenceForBillingCode('branding_removal')).toBeNull()
    expect(cadenceForBillingCode('pro_addon_typo')).toBeNull()
    expect(cadenceForBillingCode(null)).toBeNull()
    expect(keepsVersionHistory('pro')).toBe(true)
    expect(keepsVersionHistory('starter')).toBe(false)
    expect(keepsVersionHistory('professional')).toBe(false)
  })

  it('never selects published versions, missing projects or protected owners', () => {
    const projects = [
      { id: 'p1', owner_id: 'o1', published_version_id: 'v-live' },
      { id: 'p2', owner_id: 'o2', published_version_id: null },
    ]
    const versions = [
      { id: 'v-old', project_id: 'p1', label: null },
      { id: 'v-live', project_id: 'p1', label: null },
      { id: 'v-labelled', project_id: 'p1', label: 'published' },
      { id: 'v-orphan', project_id: 'gone', label: null },
      { id: 'v-pro', project_id: 'p2', label: null },
    ]
    expect(selectPrunableVersionIds(versions, projects, new Set())).toEqual(['v-old', 'v-pro'])
    expect(selectPrunableVersionIds(versions, projects, new Set(['o2']))).toEqual(['v-old'])
  })

  it('trims to the newest N backups', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(excessBackupIds(rows, 2)).toEqual(['c'])
    expect(excessBackupIds(rows, 5)).toEqual([])
    expect(excessBackupIds(rows, 0)).toEqual(['a', 'b', 'c'])
  })
})
