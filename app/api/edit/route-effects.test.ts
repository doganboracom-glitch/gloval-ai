import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCleanSite } from '@/lib/__fixtures__/sample-site'
import { DEFAULT_CURSOR_AURA, type CursorAuraConfig } from '@/lib/cursor-aura'
import type { Section, WebsiteSchema } from '@/lib/website-schema'

const state = vi.hoisted(() => ({ aiResult: null as unknown }))

vi.mock('@/lib/api-auth', () => ({ rejectAnonymous: async () => null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
}))
vi.mock('@/lib/billing', () => ({ getPlanCodeForUser: async () => 'pro' }))
vi.mock('@/lib/free-daily-limit', () => ({
  checkFreeDailyActionLimit: async () => ({ allowed: true }),
  freeDailyLimitResponseBody: () => ({}),
}))
vi.mock('@/lib/ai-credits', () => ({
  AI_ACTION_COSTS: { edit: 1 },
  getCreditBalance: async () => 100,
  consumeCredits: async () => ({ ok: true }),
}))
vi.mock('@/lib/ai-models', () => ({
  resolveAiModel: () => ({ model: 'test/model' }),
  logAiUsage: vi.fn(async () => {}),
}))
vi.mock('@/lib/ai-structured', () => ({
  generateStructured: async () => ({ object: state.aiResult }),
}))

import { POST } from '@/app/api/edit/route'

const STORED: CursorAuraConfig = { ...DEFAULT_CURSOR_AURA, enabled: true, colors: ['#22C55E'] }
const INJECTED: CursorAuraConfig = { ...DEFAULT_CURSOR_AURA, enabled: true, colors: ['#EF4444'] }

const site = (effects?: WebsiteSchema['effects']): WebsiteSchema => ({ ...buildCleanSite(), ...(effects ? { effects } : {}) })

function retitled(base: WebsiteSchema, effects?: WebsiteSchema['effects']): WebsiteSchema {
  const sections = base.sections.map((s, i) => (i === 0 ? ({ ...s, title: 'Yeni başlık' } as Section) : s))
  return { ...base, sections, ...(effects ? { effects } : { effects: undefined }) }
}

async function edit(schema: WebsiteSchema) {
  const response = await POST(
    new Request('http://localhost/api/edit', {
      method: 'POST',
      body: JSON.stringify({ schema, instruction: "Hero başlığını 'Yeni başlık' yap", lang: 'tr' }),
    }),
  )
  return (await response.json()) as { schema: WebsiteSchema; source: string }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('/api/edit and effects', () => {
  it('api/edit: AI output that adds effects to a site without them is discarded', async () => {
    const original = site()
    state.aiResult = retitled(original, { cursorAura: INJECTED })
    const body = await edit(original)
    expect(body.source).toBe('ai')
    expect(body.schema.sections[0]).toMatchObject({ title: 'Yeni başlık' })
    expect(body.schema.effects).toBeUndefined()
  })

  it('api/edit: AI output cannot change existing effects', async () => {
    const original = site({ cursorAura: STORED })
    state.aiResult = retitled(original, { cursorAura: INJECTED })
    const body = await edit(original)
    expect(body.source).toBe('ai')
    expect(body.schema.effects).toEqual({ cursorAura: STORED })
  })

  it('api/edit: existing effects are not lost when the AI output omits them', async () => {
    const original = site({ cursorAura: STORED })
    state.aiResult = retitled(original)
    const body = await edit(original)
    expect(body.source).toBe('ai')
    expect(body.schema.effects).toEqual({ cursorAura: STORED })
  })
})
