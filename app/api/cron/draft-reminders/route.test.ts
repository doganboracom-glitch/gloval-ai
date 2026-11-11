import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const runMock = vi.fn()
vi.mock('@/lib/draft-reminders/run', () => ({ runDraftRemindersCron: (...args: unknown[]) => runMock(...args) }))

import { GET } from './route'

const call = (auth?: string) =>
  GET(new Request('https://gloval.ai/api/cron/draft-reminders', { headers: auth ? { authorization: auth } : {} }))

describe('draft reminders cron route', () => {
  beforeEach(() => {
    runMock.mockReset()
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    vi.stubEnv('DRAFT_REMINDERS_AUTO_ENABLED', 'true')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('rejects missing or wrong credentials without running', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer nope')).status).toBe(401)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('returns 503 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await call('Bearer ')).status).toBe(503)
  })

  it('does nothing while the feature flag is off', async () => {
    vi.stubEnv('DRAFT_REMINDERS_AUTO_ENABLED', 'false')
    const res = await call('Bearer cron-secret')
    expect(await res.json()).toEqual({ ok: true, skipped: 'disabled' })
    expect(runMock).not.toHaveBeenCalled()
  })

  it('runs in dry-run mode by default and reports the summary', async () => {
    runMock.mockResolvedValue({ scanned: 3, sent: 0 })
    const res = await call('Bearer cron-secret')
    expect(runMock.mock.calls[0][0]).toMatchObject({ enabled: true, dryRun: true })
    expect(await res.json()).toMatchObject({ ok: true, dryRun: true, scanned: 3 })
  })

  it('returns a generic 503 when the run throws', async () => {
    runMock.mockRejectedValue(new Error('secret detail'))
    const res = await call('Bearer cron-secret')
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
  })
})
