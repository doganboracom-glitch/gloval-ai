/**
 * AI-edit quality audit (read-only, developer tool).
 *
 *   AI_EDIT_EVAL=1 pnpm eval:ai-edit
 *   AI_EDIT_EVAL=1 AI_EDIT_EVAL_ONLY=menu-add-blog,faq-add pnpm eval:ai-edit
 *
 * Calls the REAL `/api/edit` route handler in-process with the real model for
 * both tiers (standard = starter plan, advanced = pro plan) and scores the
 * returned schema as a diff against what the command should have changed.
 *
 * Safety: the route's only side effects (Supabase auth, credits, billing,
 * daily limit) are mocked with a fake user, nothing is persisted, no image is
 * generated, and the runner refuses to start in production or without
 * AI_EDIT_EVAL=1. Sites are synthetic templates, so no personal data is used.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CASES } from './ai-edit-quality/cases'
import { classify, claimedSuccess, collateralPaths, diffPaths, type CaseResult, type Check, type EditCase } from './ai-edit-quality/evaluate'
import { clinicFixture, storeFixture } from './ai-edit-quality/fixtures'
import { runClientStage } from './ai-edit-quality/pipeline'
import { ANALYSIS_MARKER, renderReport } from './ai-edit-quality/report'
import { AI_TIER_MODELS } from '@/lib/ai-models'
import type { WebsiteSchema } from '@/lib/website-schema'

import { evalContext as als, type EvalCtx as Ctx } from './ai-edit-quality/context'

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'eval-user' } }, error: null }) } }),
}))
vi.mock('@/lib/ai-credits', () => ({
  AI_ACTION_COSTS: { edit: 1 },
  consumeCredits: async () => ({ ok: true, balance: 998 }),
  getCreditBalance: async () => 999,
}))
vi.mock('@/lib/billing', () => ({ getPlanCodeForUser: async () => als.getStore()?.plan ?? 'starter' }))
vi.mock('@/lib/free-daily-limit', () => ({
  checkFreeDailyActionLimit: async () => ({ allowed: true }),
  freeDailyLimitResponseBody: () => ({}),
}))

const REPORT = path.resolve(__dirname, '../reports/ai-edit-quality.md')
const TIER_PLAN = { standart: 'starter', gelişmiş: 'pro' } as const
const CONCURRENCY = 4

const enabled =
  process.env.AI_EDIT_EVAL === '1' &&
  process.env.NODE_ENV !== 'production' &&
  process.env.VERCEL_ENV !== 'production' &&
  !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)

async function loadPrices(): Promise<Record<string, { input: number; output: number }>> {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/models')
  const json = (await res.json()) as { data: Array<{ id: string; pricing?: { input?: string; output?: string } }> }
  const out: Record<string, { input: number; output: number }> = {}
  for (const m of json.data) {
    if (m.pricing?.input && m.pricing.output) out[m.id] = { input: Number(m.pricing.input), output: Number(m.pricing.output) }
  }
  return out
}

function siteFor(c: EditCase): WebsiteSchema {
  return c.fixture === 'store' ? storeFixture() : clinicFixture()
}

function describeChange(changed: string[]): string {
  if (changed.length === 0) return 'değişiklik yok'
  const head = changed.slice(0, 3).join(', ')
  return changed.length > 3 ? `${changed.length} yol: ${head}, …` : head
}

function score(c: EditCase, before: WebsiteSchema, after: WebsiteSchema) {
  const changed = diffPaths(before, after)
  const checks: Check[] = c.kind === 'change' && c.checks ? c.checks(before, after) : []
  const collateral = c.kind === 'change' ? collateralPaths(changed, c.allowed) : changed
  return { changed, checks, collateral }
}

type Base = Pick<CaseResult, 'id' | 'category' | 'instruction' | 'expected'>

async function runApi(c: EditCase, tier: CaseResult['tier'], textInstruction: string, before: WebsiteSchema): Promise<CaseResult> {
  const { POST } = await import('@/app/api/edit/route')
  const ctx: Ctx = { plan: TIER_PLAN[tier], inputTokens: 0, outputTokens: 0 }
  const started = Date.now()
  const base: Base = { id: c.id, category: c.category, instruction: c.instruction, expected: c.expected }
  const res = await als.run(ctx, () =>
    POST(
      new Request('http://eval.local/api/edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schema: before, instruction: textInstruction, lang: 'tr' }),
      }),
    ),
  )
  const ms = Date.now() - started
  const body = (await res.json()) as { schema?: WebsiteSchema; source?: string; error?: string; notice?: string }
  const usage = { inputTokens: ctx.inputTokens, outputTokens: ctx.outputTokens }
  const common = { ...base, tier, stage: 'api' as const, ms, ...usage, costUsd: 0 }

  if (!res.ok || !body.schema) {
    return {
      ...common, source: `http-${res.status}`, outcome: c.kind === 'no-change' ? 'başarı' : 'etkisiz',
      actual: `HTTP ${res.status} ${body.error ?? ''}`.trim(), failedChecks: [], collateral: [], claimed: false,
      note: body.error === 'PAGE_LIMIT_REACHED' ? 'PAGE_LIMIT' : undefined,
    }
  }
  const { changed, checks, collateral } = score(c, before, body.schema)
  const outcome = classify({ kind: c.kind, changed: changed.length > 0, checks, collateral })
  return {
    ...common, source: body.source ?? null, outcome,
    actual: `${body.source}: ${describeChange(changed)}${body.notice ? ' (panel uyarısı)' : ''}`,
    failedChecks: checks.filter((k) => !k.pass).map((k) => k.label), collateral,
    claimed: claimedSuccess('api', body.source ?? null),
  }
}

function runLocal(c: EditCase, tier: CaseResult['tier'], client: ReturnType<typeof runClientStage>, before: WebsiteSchema): CaseResult {
  const base = { id: c.id, category: c.category, instruction: c.instruction, expected: c.expected, tier, ms: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
  if (client.stage === 'image') {
    const t = client.intent.target
    const pass = client.intent.action === 'generate' && t.kind === c.imageTarget
    return {
      ...base, stage: 'image', source: 'image-intent', outcome: pass ? 'başarı' : 'yanlış',
      actual: `görsel hattı: ${t.kind}/${client.intent.action}`, failedChecks: pass ? [] : ['hedef yanlış çözüldü'], collateral: [], claimed: true,
    }
  }
  if (client.stage !== 'parser') throw new Error('unreachable')
  const { changed, checks, collateral } = score(c, before, client.schema)
  const outcome = classify({ kind: c.kind, changed: changed.length > 0, checks, collateral })
  return {
    ...base, stage: 'parser', source: client.source, outcome,
    actual: `ayrıştırıcı: ${describeChange(changed)} · "${client.feedback.slice(0, 60)}"`,
    failedChecks: checks.filter((k) => !k.pass).map((k) => k.label), collateral, claimed: claimedSuccess('parser', client.source),
  }
}

async function pool<T>(jobs: Array<() => Promise<T>>, size: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length)
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < jobs.length) {
        const i = next++
        out[i] = await jobs[i]()
      }
    }),
  )
  return out
}

describe.skipIf(!enabled)('ai-edit-quality', () => {
  it('runs the command set and writes the report', async () => {
    const only = process.env.AI_EDIT_EVAL_ONLY?.split(',').map((s) => s.trim())
    const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES
    const prices = await loadPrices()
    const models = { standart: AI_TIER_MODELS.standard, gelişmiş: AI_TIER_MODELS.advanced }

    const origInfo = console.info
    console.info = (...args: unknown[]) => {
      const store = als.getStore()
      if (args[0] === '[ai-usage]' && store) {
        const u = args[1] as { inputTokens?: number | null; outputTokens?: number | null }
        store.inputTokens += u.inputTokens ?? 0
        store.outputTokens += u.outputTokens ?? 0
      }
    }

    try {
      const jobs: Array<() => Promise<CaseResult>> = []
      for (const c of cases) {
        const before = siteFor(c)
        const client = runClientStage(c.instruction, before)
        for (const tier of ['standart', 'gelişmiş'] as const) {
          jobs.push(async () => {
            let r: CaseResult
            if (client.stage === 'api') r = await runApi(c, tier, client.textInstruction, before)
            else r = runLocal(c, tier, client, before)
            const p = prices[models[tier]]
            if (p) r.costUsd = r.inputTokens * p.input + r.outputTokens * p.output
            return r
          })
        }
      }
      const results = await pool(jobs, CONCURRENCY)

      const previous = existsSync(REPORT) ? readFileSync(REPORT, 'utf8') : ''
      const at = previous.indexOf(ANALYSIS_MARKER)
      const previousAnalysis = at >= 0 ? previous.slice(at) : undefined
      writeFileSync(REPORT, renderReport({ cases, results, models, date: new Date().toISOString().slice(0, 10), previousAnalysis }))
      writeFileSync('/tmp/ai-edit-quality.json', JSON.stringify(results, null, 2))
      expect(results.length).toBe(cases.length * 2)
    } finally {
      console.info = origInfo
    }
  }, 40 * 60_000)
})
