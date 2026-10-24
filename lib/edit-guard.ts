import { websiteSchema, type WebsiteSchema } from '@/lib/website-schema'
import { limitReason, listLimitFor } from '@/lib/list-limits'
import { SITE_SECTION_HARD_CAP } from '@/lib/pricing-config'

/**
 * Edit guard: every edit result is checked against the website schema before
 * it becomes the live draft. An edit that introduces a NEW schema problem is
 * rejected (the previous snapshot stays), so autosave and publish never see a
 * structure the renderer cannot read.
 */

type Issue = { path: (string | number)[]; code: string; message: string }

function issuesOf(site: WebsiteSchema): Issue[] {
  const result = websiteSchema.safeParse(site)
  if (result.success) return []
  return result.error.issues.map((i) => ({
    path: i.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number'),
    code: i.code,
    message: i.message,
  }))
}

/**
 * Identity of an issue that survives reordering. A section's position in the
 * list is not part of its identity: moving a section changes `sections.<n>`
 * in every path under it, which used to make problems the site ALREADY had
 * look brand new and block the move.
 */
const keyOf = (site: WebsiteSchema, i: Issue) => {
  const [root, index, ...rest] = i.path
  if (root === 'sections' && typeof index === 'number') {
    const type = (site.sections[index] as { type?: unknown } | undefined)?.type
    return `sections.${typeof type === 'string' ? type : '?'}.${rest.join('.')}|${i.code}`
  }
  return `${i.path.join('.')}|${i.code}`
}

/** Issues of `next` that exceed what `previous` already had (compared as a count per identity). */
function freshIssues(previous: WebsiteSchema | null, next: WebsiteSchema, nextIssues: Issue[]): Issue[] {
  const budget = new Map<string, number>()
  for (const issue of previous ? issuesOf(previous) : []) {
    const key = keyOf(previous as WebsiteSchema, issue)
    budget.set(key, (budget.get(key) ?? 0) + 1)
  }
  return nextIssues.filter((issue) => {
    const key = keyOf(next, issue)
    const left = budget.get(key) ?? 0
    if (left > 0) {
      budget.set(key, left - 1)
      return false
    }
    return true
  })
}

export type GuardResult = { ok: true } | { ok: false; message: string; issues: Issue[] }

/** Human-readable (Turkish) explanation for the first new problem. */
function describe(site: WebsiteSchema, issue: Issue): string {
  const [root, sectionIndex] = issue.path
  if (root === 'sections' && issue.path.length === 1) {
    return `Bir sitede en fazla ${SITE_SECTION_HARD_CAP} bölüm olabilir; yeni bölüm eklenmedi.`
  }
  if (root === 'sections' && typeof sectionIndex === 'number') {
    const section = site.sections[sectionIndex]
    if (section) {
      const kind = issue.code === 'too_small' ? 'remove' : issue.code === 'too_big' ? 'add' : null
      const reason = kind ? limitReason(section.type, kind) : null
      if (reason) return `${reason} Değişiklik geri alındı.`
      if (issue.code === 'too_small') return 'Bu bölümde bu kadar az öğe bırakılamaz; değişiklik geri alındı.'
      if (issue.code === 'too_big') return 'Bu bölümde bu kadar çok öğe olamaz; değişiklik geri alındı.'
    }
  }
  return 'Bu değişiklik sitenizin yapısını bozacağı için uygulanmadı ve geri alındı.'
}

export function guardEdit(previous: WebsiteSchema | null, next: WebsiteSchema): GuardResult {
  const nextIssues = issuesOf(next)
  if (nextIssues.length === 0) return { ok: true }
  const fresh = freshIssues(previous, next, nextIssues)
  if (fresh.length === 0) return { ok: true }
  return { ok: false, message: describe(next, fresh[0]), issues: fresh }
  }

export function isSchemaValid(site: WebsiteSchema): boolean {
  return issuesOf(site).length === 0
}

export type AiSuggestionVerdict =
  | { ok: true; schema: WebsiteSchema }
  | { ok: false; message: string }

const AI_REJECTED = 'Yapay zekâ önerisi sitenizin yapısıyla uyuşmadığı için uygulanmadı. Sitenizde değişiklik yapılmadı.'

/** Names the list section (and its limit) an AI answer broke, without echoing any field value. */
function describeInvalidAi(raw: unknown, issues: Issue[]): string {
  const sections = (raw as { sections?: unknown } | null)?.sections
  for (const issue of issues) {
    const [root, index] = issue.path
    if (root !== 'sections' || typeof index !== 'number' || !Array.isArray(sections)) continue
    const type = (sections[index] as { type?: unknown } | undefined)?.type
    if (typeof type !== 'string') continue
    const kind = issue.code === 'too_big' ? 'add' : issue.code === 'too_small' ? 'remove' : null
    const reason = kind ? limitReason(type, kind) : null
    if (reason && listLimitFor(type)) {
      return `Yapay zekâ önerisi uygulanmadı: ${reason} Sitenizde değişiklik yapılmadı.`
    }
  }
  return AI_REJECTED
}

/**
 * Every AI result (suggestion preview, Apply, auto-apply) is vetted here
 * before it can reach the canvas or the history. A suggestion that does not
 * satisfy the website schema, or that introduces a new schema problem compared
 * with the current site, is rejected with a readable message.
 */
export function vetAiSuggestion(current: WebsiteSchema, raw: unknown): AiSuggestionVerdict {
  const parsed = websiteSchema.safeParse(raw)
  if (!parsed.success) {
    const issues: Issue[] = parsed.error.issues.map((i) => ({
      path: i.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number'),
      code: i.code,
      message: i.message,
    }))
    return { ok: false, message: describeInvalidAi(raw, issues) }
  }
  const verdict = guardEdit(current, parsed.data)
  if (!verdict.ok) return { ok: false, message: AI_REJECTED }
  return { ok: true, schema: parsed.data }
}
