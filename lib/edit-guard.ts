import { websiteSchema, type WebsiteSchema } from '@/lib/website-schema'
import { limitReason, listLimitFor } from '@/lib/list-limits'

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

const keyOf = (i: Issue) => `${i.path.join('.')}|${i.code}`

export type GuardResult = { ok: true } | { ok: false; message: string; issues: Issue[] }

/** Human-readable (Turkish) explanation for the first new problem. */
function describe(site: WebsiteSchema, issue: Issue): string {
  const [root, sectionIndex] = issue.path
  if (root === 'sections' && typeof sectionIndex === 'number') {
    const section = site.sections[sectionIndex]
    if (section) {
      if (issue.code === 'too_small') return 'Bu bölümde bu kadar az öğe bırakılamaz; değişiklik geri alındı.'
      if (issue.code === 'too_big') return 'Bu bölümde bu kadar çok öğe olamaz; değişiklik geri alındı.'
    }
  }
  return 'Bu değişiklik sitenizin yapısını bozacağı için uygulanmadı ve geri alındı.'
}

export function guardEdit(previous: WebsiteSchema | null, next: WebsiteSchema): GuardResult {
  const nextIssues = issuesOf(next)
  if (nextIssues.length === 0) return { ok: true }
  const known = new Set((previous ? issuesOf(previous) : []).map(keyOf))
  const fresh = nextIssues.filter((i) => !known.has(keyOf(i)))
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
