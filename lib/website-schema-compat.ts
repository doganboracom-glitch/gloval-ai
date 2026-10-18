import { websiteSchema, type WebsiteSchema } from '@/lib/website-schema'
import { countCodes, repairToSchema, summarizeIssues, type IssueSummary, type RepairStep } from '@/lib/ai-repair'
import { siteRepairOptions } from '@/lib/site-repair'

export type NormalizedSite =
  | { ok: true; value: WebsiteSchema; steps: RepairStep[]; repaired: boolean }
  | { ok: false; steps: RepairStep[]; issues: IssueSummary[] }

/**
 * Reads a stored/legacy site schema. A schema that already validates is returned
 * untouched; otherwise the same repair pass the AI pipeline uses fixes what it
 * safely can (surplus sections/pages, blank titles, unknown section types, bad
 * enums). Only a schema that is still invalid afterwards is reported as not ok,
 * so a drifted row degrades to a recoverable state instead of a dead page.
 */
export function normalizeWebsiteSchema(raw: unknown, lang: 'tr' | 'en' = 'tr'): NormalizedSite {
  const direct = websiteSchema.safeParse(raw)
  if (direct.success) return { ok: true, value: direct.data, steps: [], repaired: false }

  const cloned = cloneJson(raw)
  if (cloned === undefined) {
    return { ok: false, steps: [], issues: summarizeIssues(direct.error.issues) }
  }
  const result = repairToSchema(cloned, websiteSchema, siteRepairOptions({ lang, trimSections: true }))
  if (result.ok) return { ok: true, value: result.value, steps: result.steps, repaired: result.steps.length > 0 }
  return { ok: false, steps: result.steps, issues: result.issues }
}

/** For write paths: repaired or valid schema, or a thrown error with the field paths (never values). */
export function parseWebsiteForSave(raw: unknown, lang: 'tr' | 'en' = 'tr'): WebsiteSchema {
  const result = normalizeWebsiteSchema(raw, lang)
  if (result.ok) {
    logSchemaRepair('save', result.steps)
    return result.value
  }
  throw new Error(`invalid_site_schema: ${result.issues.map((i) => `${i.path}:${i.code}`).join(', ')}`)
}

export type SchemaCandidate = { created_at: string; schema_data: unknown }

/**
 * Newest stored snapshot that is readable (valid, or repairable by the same
 * pass the editor uses), or null when none is. Drives "restore the last valid
 * version" for a draft that can no longer be opened.
 */
export function pickLastValidSchema(
  candidates: readonly SchemaCandidate[],
  lang: 'tr' | 'en' = 'tr',
): WebsiteSchema | null {
  const newestFirst = [...candidates].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  for (const candidate of newestFirst) {
    const result = normalizeWebsiteSchema(candidate.schema_data, lang)
    if (result.ok) return result.value
  }
  return null
}

/** Logs repair codes and paths only, never field values. */
export function logSchemaRepair(context: string, steps: readonly RepairStep[]): void {
  if (steps.length === 0) return
  console.warn(`[schema-compat] ${context} repaired`, countCodes(steps))
}

function cloneJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}
