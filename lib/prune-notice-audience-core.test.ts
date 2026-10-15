import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  affectedOwners,
  countByPlan,
  createPacer,
  noticeDedupeKey,
  noticePlanFor,
} from '@/lib/prune-notice-audience-core'

describe('noticePlanFor', () => {
  it('maps no subscription to FREE and starter to STARTER', () => {
    expect(noticePlanFor([])).toBe('FREE')
    expect(noticePlanFor(['starter'])).toBe('STARTER')
  })
  it('excludes owners on a plan that keeps history', () => {
    expect(noticePlanFor(['starter', 'pro'])).toBeNull()
    expect(noticePlanFor(['ecommerce'])).toBeNull()
  })
})

describe('affectedOwners', () => {
  const projects = [
    { id: 'p1', owner_id: 'free', published_version_id: 'live' },
    { id: 'p2', owner_id: 'starter', published_version_id: null },
    { id: 'p3', owner_id: 'pro', published_version_id: null },
  ]
  const codes = new Map<string, string[]>([
    ['starter', ['starter']],
    ['pro', ['pro']],
  ])

  it('counts stale non-published versions per Free/Starter owner and skips protected owners', () => {
    const owners = affectedOwners(
      [
        { id: 'a', project_id: 'p1', label: null },
        { id: 'live', project_id: 'p1', label: null },
        { id: 'b', project_id: 'p1', label: 'published' },
        { id: 'c', project_id: 'p2', label: null },
        { id: 'd', project_id: 'p3', label: null },
      ],
      projects,
      codes,
    )
    expect(owners.get('free')).toEqual({ plan: 'FREE', versions: 1 })
    expect(owners.get('starter')).toEqual({ plan: 'STARTER', versions: 1 })
    expect(owners.has('pro')).toBe(false)
    expect(countByPlan(owners)).toEqual({ FREE: 1, STARTER: 1 })
  })
})

describe('send safeguards', () => {
  it('uses one stable dedupe key per owner', () => {
    expect(noticeDedupeKey('u1')).toBe(noticeDedupeKey('u1'))
    expect(noticeDedupeKey('u1')).not.toBe(noticeDedupeKey('u2'))
  })

  it('paces calls at the configured interval', async () => {
    let clock = 0
    const sleeps: number[] = []
    const pace = createPacer(2000, () => clock, async (ms) => {
      sleeps.push(ms)
      clock += ms
    })
    await pace()
    await pace()
    await pace()
    expect(sleeps).toEqual([2000, 2000])
  })

  it('the send script is dry run unless --send is passed, and the count script never reads e-mails', () => {
    const send = readFileSync(join(process.cwd(), 'scripts/send-version-prune-notice.ts'), 'utf8')
    expect(send).toMatch(/process\.argv\.includes\('--send'\)/)
    expect(send.indexOf("if (!send)")).toBeLessThan(send.indexOf('sendVersionPruneNotice({'))
    const count = readFileSync(join(process.cwd(), 'scripts/count-version-prune-audience.ts'), 'utf8')
    expect(count).not.toMatch(/getUserById|sendVersionPruneNotice|auth\.admin/)
  })
})
