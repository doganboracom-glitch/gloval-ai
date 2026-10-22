import { websiteSchema, type WebsiteSchema } from '@/lib/website-schema'

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
