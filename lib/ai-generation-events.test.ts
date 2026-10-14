import { describe, expect, it, vi } from 'vitest'
import {
  AI_EVENT_RETENTION_DAYS,
  recordAiGenerationEvent,
  sweepOldAiGenerationEvents,
  toAiEventRow,
} from '@/lib/ai-generation-events'
import { resolveAiModel } from '@/lib/ai-models'
import { siteLimitsPromptHint } from '@/lib/page-limits'
import { SITE_PAGE_HARD_CAP, SITE_SECTION_HARD_CAP } from '@/lib/pricing-config'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('toAiEventRow', () => {
  it('keeps only flow, tier, model, outcome and plan code', () => {
    const row = toAiEventRow(resolveAiModel('siteGenerate', 'pro'), 'repaired')
    expect(Object.keys(row).sort()).toEqual(['flow', 'model', 'outcome', 'plan_code', 'tier'])
    expect(row).toMatchObject({ flow: 'siteGenerate', tier: 'advanced', outcome: 'repaired', plan_code: 'pro' })
  })
})

describe('recordAiGenerationEvent', () => {
  it('inserts the row through the given client', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient
    await recordAiGenerationEvent(resolveAiModel('siteEdit', 'free'), 'fallback', client)
    expect(client.from).toHaveBeenCalledWith('ai_generation_events')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'fallback', tier: 'standard' }))
  })

  it('never throws when the table is missing', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'relation does not exist' } })
    const client = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient
    await expect(recordAiGenerationEvent(resolveAiModel('siteEdit', 'free'), 'ok', client)).resolves.toBeUndefined()
  })

  it('does nothing without a client under test', async () => {
    await expect(recordAiGenerationEvent(resolveAiModel('siteEdit', 'free'), 'ok')).resolves.toBeUndefined()
  })
})

describe('sweepOldAiGenerationEvents', () => {
  it('deletes rows older than the 90-day window', async () => {
    const lt = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 1 }, { id: 2 }], error: null }) })
    const admin = { from: vi.fn().mockReturnValue({ delete: () => ({ lt }) }) } as unknown as SupabaseClient
    const now = Date.UTC(2026, 0, 100)
    expect(await sweepOldAiGenerationEvents(admin, now)).toBe(2)
    const cutoff = new Date(lt.mock.calls[0][1] as string).getTime()
    expect(now - cutoff).toBe(AI_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  })
})

describe('siteLimitsPromptHint', () => {
  it('states the plan page limit and the section cap explicitly', () => {
    const hint = siteLimitsPromptHint(5)
    expect(hint).toContain('at most 5 entries')
    expect(hint).toContain(`at most ${SITE_SECTION_HARD_CAP} entries`)
  })

  it('never states more pages than the schema allows', () => {
    expect(siteLimitsPromptHint(99)).toContain(`at most ${SITE_PAGE_HARD_CAP} entries`)
  })
})
