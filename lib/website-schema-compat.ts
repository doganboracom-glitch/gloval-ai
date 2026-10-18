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
