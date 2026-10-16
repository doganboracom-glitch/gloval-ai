import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * Pure scoring helpers for the AI-edit quality audit. No I/O, no network: the
 * runner (`scripts/ai-edit-quality.eval.ts`) feeds them before/after schemas.
 */

export type Outcome = 'başarı' | 'kısmi' | 'etkisiz' | 'yanlış'
export type CaseKind = 'change' | 'no-change'

export type Check = { label: string; pass: boolean }

export type EditCase = {
  id: string
  category: string
  instruction: string
  fixture: 'clinic' | 'store'
  /** `no-change`: ambiguous / unsupported commands, where the right behaviour is to leave the site alone. */
  kind: CaseKind
  /** Human-readable expected change (shown in the report). */
  expected: string
  /** Required effects. Ignored for `no-change` cases. */
  checks?: (before: WebsiteSchema, after: WebsiteSchema) => Check[]
  /** Schema paths (dot notation, prefix match) the command may legitimately touch. */
  allowed?: string[]
  /** Image cases are measured by intent detection only (no image is generated, no cost). */
  imageTarget?: 'hero' | 'section' | 'logo'
}

/* -------------------------------------------------------------------------- */
/*  Schema diff                                                               */
/* -------------------------------------------------------------------------- */

function flatten(value: unknown, path: string, out: Map<string, string>): void {
  if (Array.isArray(value)) {
    out.set(`${path}.length`, String(value.length))
    value.forEach((item, i) => flatten(item, `${path}.${i}`, out))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, path ? `${path}.${key}` : key, out)
    }
    return
  }
  out.set(path, JSON.stringify(value))
}

/** Leaf paths whose value differs between the two schemas (image payloads are ignored). */
export function diffPaths(before: unknown, after: unknown): string[] {
  const a = new Map<string, string>()
  const b = new Map<string, string>()
  flatten(before, '', a)
  flatten(after, '', b)
  const paths = new Set([...a.keys(), ...b.keys()])
  return [...paths].filter((p) => a.get(p) !== b.get(p) && !/\.src$/.test(p)).sort()
}

/** Changed paths that fall outside every allowed prefix. */
export function collateralPaths(changed: string[], allowed: string[] = []): string[] {
  return changed.filter((p) => !allowed.some((prefix) => p === prefix || p.startsWith(`${prefix}.`)))
}

/* -------------------------------------------------------------------------- */
/*  Classification                                                            */
/* -------------------------------------------------------------------------- */

export function classify(input: {
  kind: CaseKind
  changed: boolean
  checks: Check[]
  collateral: string[]
}): Outcome {
  const { kind, changed, checks, collateral } = input
  if (kind === 'no-change') return changed ? 'yanlış' : 'başarı'
  if (!changed) return 'etkisiz'
  const passed = checks.filter((c) => c.pass).length
  if (checks.length > 0 && passed === 0) return 'yanlış'
  if (passed === checks.length && collateral.length === 0) return 'başarı'
  return 'kısmi'
}

/**
 * What the chat told the user, mirrored from `applyEdit` in
 * components/website-preview.tsx: a result with `source` ai/command is
 * announced as "uyguladım" the moment the PREVIEW appears; only fallback, plan
 * errors and honest parser messages avoid a success claim.
 */
export function claimedSuccess(stage: 'image' | 'parser' | 'api', source: string | null): boolean {
  if (stage === 'image') return true
  if (stage === 'parser') return source === 'parser-applied'
  return source === 'ai' || source === 'command'
}

/* -------------------------------------------------------------------------- */
/*  Aggregation                                                               */
/* -------------------------------------------------------------------------- */

export type CaseResult = {
  id: string
  category: string
  instruction: string
  expected: string
  /** Short description of what really changed (or why nothing did). */
  actual: string
  tier: 'standart' | 'gelişmiş'
  stage: 'image' | 'parser' | 'api'
  source: string | null
  outcome: Outcome
  failedChecks: string[]
  collateral: string[]
  claimed: boolean
  ms: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  note?: string
}

export type TierSummary = {
  tier: CaseResult['tier']
  total: number
  counts: Record<Outcome, number>
  successRate: number
  falseClaims: number
  avgMs: number
  costUsd: number
}

export function isFalseClaim(r: Pick<CaseResult, 'claimed' | 'outcome'>): boolean {
  return r.claimed && r.outcome !== 'başarı'
}

export function summarize(results: CaseResult[], tier: CaseResult['tier']): TierSummary {
  const rows = results.filter((r) => r.tier === tier)
  const counts: Record<Outcome, number> = { başarı: 0, kısmi: 0, etkisiz: 0, yanlış: 0 }
  for (const r of rows) counts[r.outcome] += 1
  const total = rows.length
  return {
    tier,
    total,
    counts,
    successRate: total ? counts.başarı / total : 0,
    falseClaims: rows.filter(isFalseClaim).length,
    avgMs: total ? Math.round(rows.reduce((s, r) => s + r.ms, 0) / total) : 0,
    costUsd: rows.reduce((s, r) => s + r.costUsd, 0),
  }
}

/** Pattern-based failure bucket used by the report's "en sık nedenler" table. */
export function failureBucket(r: CaseResult): string | null {
  if (r.outcome === 'başarı') return null
  if (r.note?.startsWith('PAGE_LIMIT')) return 'şema/plan sınırı'
  if (r.stage === 'parser') return 'komut ayrıştırıcı (yanlış eşleme)'
  if (r.source === 'fallback') return 'model değişiklik üretmedi / reddedildi (fallback)'
  if (r.claimed && r.outcome === 'etkisiz') return 'yanlış başarı mesajı'
  if (r.collateral.length > 0) return 'istem yetersiz: istenmeyen alanlar değişti'
  return 'istem yetersiz: yanlış/eksik alan'
}
