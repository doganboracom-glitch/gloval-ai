import { describe, expect, it, vi } from 'vitest'
import type { DraftReminderConfig, ReminderRecord } from './core'
import {
  draftReminderDedupeKey,
  runDraftReminders,
  type DraftCandidate,
  type DraftReminderDeps,
  type DraftReminderStore,
  type OwnerProfile,
  type RecordInput,
} from './service'

const NOW = new Date('2026-06-30T07:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

type World = {
  candidates: DraftCandidate[]
  profiles: OwnerProfile[]
  activity: Record<string, string | null>
  records: Array<RecordInput & { createdAt: string }>
  claims: Set<string>
}

function project(id: string, owner: string, extra: Partial<DraftCandidate> = {}): DraftCandidate {
  return { projectId: id, ownerId: owner, projectType: 'corporate', published: false, remindersMuted: false, ...extra }
}

function profile(id: string, extra: Partial<OwnerProfile> = {}): OwnerProfile {
  return { id, email: `${id}@mail.com`, status: 'active', optOut: false, ...extra }
}

function setup(world: Partial<World>, config: Partial<DraftReminderConfig> = {}, overrides: Partial<DraftReminderDeps> = {}) {
  const w: World = { candidates: [], profiles: [], activity: {}, records: [], claims: new Set(), ...world }
  const store: DraftReminderStore = {
    listCandidates: async (offset, limit) => w.candidates.slice(offset, offset + limit),
    loadProfiles: async (ids) => new Map(w.profiles.filter((p) => ids.includes(p.id)).map((p) => [p.id, p])),
    loadLastActivity: async (ids) => new Map(ids.map((id) => [id, w.activity[id] ?? null])),
    loadRecords: async (ids) => {
      const out = new Map<string, ReminderRecord[]>()
      for (const r of w.records.filter((row) => ids.includes(row.projectId))) {
        out.set(r.projectId, [...(out.get(r.projectId) ?? []), { kind: r.kind, status: r.status, createdAt: r.createdAt }])
      }
      return out
    },
    resolveRecipient: async (userId) => ({ email: `${userId}@mail.com`, locale: 'tr' }),
    claimLog: async ({ dedupeKey }) => {
      if (w.claims.has(dedupeKey)) return { status: 'duplicate' }
      w.claims.add(dedupeKey)
      return { status: 'claimed', logId: `log-${dedupeKey}` }
    },
    releaseLog: async (key) => void w.claims.delete(key),
    insertRecord: async (input) => {
      if (input.status === 'sent' && w.records.some((r) => r.projectId === input.projectId && r.kind === input.kind && r.status === 'sent')) {
        return 'duplicate'
      }
      w.records.push({ ...input, createdAt: NOW.toISOString() })
      return 'ok'
    },
  }
  const send = vi.fn<DraftReminderDeps['send']>(async () => ({ ok: true }))
  const deps: DraftReminderDeps = {
    store,
    send,
    buildEmail: ({ kind, isEcommerce }) => ({ subject: `s-${kind}`, html: `<p>${isEcommerce ? 'eco' : 'corp'}</p>`, text: kind }),
    isAdminEmail: (email) => email === 'boss@mail.com',
    now: NOW,
    config: { enabled: true, dryRun: false, maxPerRun: 50, ...config },
    ...overrides,
  }
  return { w, deps, send, run: () => runDraftReminders(deps) }
}

describe('live sending', () => {
  it('sends d7 to an eligible draft, records it and links the notification log', async () => {
    const { w, send, run } = setup({ candidates: [project('p1', 'u1')], profiles: [profile('u1')], activity: { p1: daysAgo(10) } })
    const summary = await run()
    expect(summary.sent).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'u1@mail.com', subject: 's-d7', idempotencyKey: draftReminderDedupeKey('p1', 'd7') })
    expect(w.records).toMatchObject([{ projectId: 'p1', kind: 'd7', status: 'sent', notificationLogId: 'log-draft-reminder:p1:d7' }])
  })

  it('sends the same project and stage only once across consecutive runs', async () => {
    const { w, send, run } = setup({ candidates: [project('p1', 'u1')], profiles: [profile('u1')], activity: { p1: daysAgo(10) } })
    await run()
    await run()
    expect(send).toHaveBeenCalledTimes(1)
    expect(w.records.filter((r) => r.status === 'sent')).toHaveLength(1)
  })

  it('does not send when the claim already exists (parallel run)', async () => {
    const { w, send, run } = setup({ candidates: [project('p1', 'u1')], profiles: [profile('u1')], activity: { p1: daysAgo(10) } })
    w.claims.add(draftReminderDedupeKey('p1', 'd7'))
    const summary = await run()
    expect(send).not.toHaveBeenCalled()
    expect(summary.duplicates).toBe(1)
  })

  it('an old draft gets one stage on the first run and the next stage only after 14 days', async () => {
    const { send, run, w } = setup({ candidates: [project('p1', 'u1')], profiles: [profile('u1')], activity: { p1: daysAgo(800) } })
    await run()
    await run()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].subject).toBe('s-d7')
    w.records[0].createdAt = daysAgo(14)
    await run()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].subject).toBe('s-d30')
  })

  it('stays silent once m12 has been sent', async () => {
    const records = (['d7', 'd30', 'm6', 'm12'] as const).map((kind, i) => ({
      projectId: 'p1', userId: 'u1', kind, status: 'sent' as const, createdAt: daysAgo(300 - i * 60),
    }))
    const { send, run } = setup({ candidates: [project('p1', 'u1')], profiles: [profile('u1')], activity: { p1: daysAgo(900) }, records })
    const summary = await run()
    expect(send).not.toHaveBeenCalled()
    expect(summary.skipped.sequence_complete).toBe(1)
  })

  it('marks e-commerce drafts so the template adds the package note', async () => {
    const { send, run } = setup({ candidates: [project('p1', 'u1', { projectType: 'ecommerce' })], profiles: [profile('u1')], activity: { p1: daysAgo(10) } })
    await run()
    expect(send.mock.calls[0][0].html).toContain('eco')
  })
})

describe('exclusions', () => {
  it('skips published, muted, opted-out, inactive, admin and test accounts, but includes paid users', async () => {
    const { send, run } = setup({
      candidates: [
        project('pub', 'u1', { published: true }),
        project('mut', 'u2', { remindersMuted: true }),
        project('opt', 'u3'),
        project('ina', 'u4'),
        project('adm', 'boss'),
        project('tst', 'u6'),
        project('ok', 'u7'),
      ],
      profiles: [
        profile('u1'),
        profile('u2'),
        profile('u3', { optOut: true }),
        profile('u4', { status: 'suspended' }),
        profile('boss'),
        profile('u6', { email: 'test@gloval.ai' }),
        profile('u7'),
      ],
      activity: { pub: daysAgo(40), mut: daysAgo(40), opt: daysAgo(40), ina: daysAgo(40), adm: daysAgo(40), tst: daysAgo(40), ok: daysAgo(40) },
    })
    const summary = await run()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].to).toBe('u7@mail.com')
    expect(summary.skipped).toMatchObject({ published: 1, project_muted: 1, opted_out: 1, inactive_account: 1, admin_or_test: 2 })
  })

  it('sends at most one email per user per run', async () => {
    const { send, run } = setup({
      candidates: [project('a', 'u1'), project('b', 'u1')],
      profiles: [profile('u1')],
      activity: { a: daysAgo(20), b: daysAgo(20) },
    })
    await run()
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('safety flags and limits', () => {
  it('dry run sends nothing, writes dry_run rows and never writes the same row twice', async () => {
    const { w, send, run } = setup(
      { candidates: [project('p1', 'u1'), project('p2', 'u2')], profiles: [profile('u1'), profile('u2')], activity: { p1: daysAgo(10), p2: daysAgo(10) } },
      { dryRun: true },
    )
    const first = await run()
    const second = await run()
    expect(send).not.toHaveBeenCalled()
    expect(first.dryRunRecorded).toBe(2)
    expect(second.dryRunRecorded).toBe(0)
    expect(w.records.filter((r) => r.status === 'dry_run')).toHaveLength(2)
    expect(w.claims.size).toBe(0)
  })

  it('honours the per-run cap', async () => {
    const candidates = ['1', '2', '3', '4', '5'].map((n) => project(`p${n}`, `u${n}`))
    const { send, run } = setup(
      { candidates, profiles: candidates.map((c) => profile(c.ownerId)), activity: Object.fromEntries(candidates.map((c) => [c.projectId, daysAgo(20)])) },
      { maxPerRun: 2 },
    )
    const summary = await run()
    expect(send).toHaveBeenCalledTimes(2)
    expect(summary.attempted).toBe(2)
  })

  it('one failing send does not block the others and is recorded as failed with the claim released', async () => {
    const candidates = [project('p1', 'u1'), project('p2', 'u2')]
    const { w, send, run } = setup({
      candidates,
      profiles: candidates.map((c) => profile(c.ownerId)),
      activity: { p1: daysAgo(20), p2: daysAgo(20) },
    })
    send.mockResolvedValueOnce({ ok: false, errorCode: 'http_500' })
    const summary = await run()
    expect(summary).toMatchObject({ sent: 1, failed: 1 })
    expect(w.records.find((r) => r.status === 'failed')).toMatchObject({ projectId: 'p1', errorCode: 'http_500' })
    expect(w.claims.has(draftReminderDedupeKey('p1', 'd7'))).toBe(false)
  })

  it('an exception for one project does not stop the run', async () => {
    const candidates = [project('p1', 'u1'), project('p2', 'u2')]
    const { send, run, deps } = setup({ candidates, profiles: candidates.map((c) => profile(c.ownerId)), activity: { p1: daysAgo(20), p2: daysAgo(20) } })
    const original = deps.store.resolveRecipient
    deps.store.resolveRecipient = async (id) => {
      if (id === 'u1') throw new Error('boom')
      return original(id)
    }
    const summary = await run()
    expect(summary.errors).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries a failed stage on the next day', async () => {
    const { w, send, run } = setup({ candidates: [project('p1', 'u1')], profiles: [profile('u1')], activity: { p1: daysAgo(20) } })
    send.mockResolvedValueOnce({ ok: false, errorCode: 'network' })
    await run()
    w.records[0].createdAt = daysAgo(1)
    await run()
    expect(send).toHaveBeenCalledTimes(2)
    expect(w.records.filter((r) => r.status === 'sent')).toHaveLength(1)
  })
})
