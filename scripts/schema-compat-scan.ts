/**
 * Read-only: checks every project's draft schema and published version against
 * the current websiteSchema. Only SELECTs; nothing is written. Prints counts,
 * error classes with example paths, and project id + slug. Never prints content.
 *
 *   set -a && source /vercel/share/.env.project && set +a
 *   npx tsx scripts/schema-compat-scan.ts
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { websiteSchema } from '@/lib/website-schema'
import { summarizeIssues } from '@/lib/ai-repair'
import { normalizeWebsiteSchema } from '@/lib/website-schema-compat'

type Source = 'draft' | 'published'
type Status = 'valid' | 'repaired' | 'unrepairable'

interface Finding {
  projectId: string
  slug: string | null
  source: Source
  status: Status
  classes: string[]
}

const PAGE = 200

function classify(raw: unknown): { status: Status; classes: string[] } {
  const direct = websiteSchema.safeParse(raw)
  if (direct.success) return { status: 'valid', classes: [] }
  const classes = summarizeIssues(direct.error.issues).map((i) => `${i.path}:${i.code}`)
  const normalized = normalizeWebsiteSchema(raw)
  return { status: normalized.ok ? 'repaired' : 'unrepairable', classes }
}

/** Collapses array indexes so "sections.12" and "sections.13" count as one class. */
function classKey(entry: string): string {
  return entry.replace(/\.\d+/g, '.#')
}

async function main() {
  const db = createAdminClient()
  const findings: Finding[] = []
  const projects: Array<{ id: string; slug: string | null; schema_data: unknown; published_version_id: string | null }> = []

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('projects')
      .select('id, slug, schema_data, published_version_id')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    projects.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const versionIds = projects.map((p) => p.published_version_id).filter((id): id is string => Boolean(id))
  const versions = new Map<string, unknown>()
  for (let i = 0; i < versionIds.length; i += PAGE) {
    const { data, error } = await db
      .from('project_versions')
      .select('id, schema_data')
      .in('id', versionIds.slice(i, i + PAGE))
    if (error) throw error
    for (const row of data ?? []) versions.set(row.id as string, row.schema_data)
  }

  for (const project of projects) {
    const draft = classify(project.schema_data)
    findings.push({ projectId: project.id, slug: project.slug, source: 'draft', ...draft })
    if (project.published_version_id && versions.has(project.published_version_id)) {
      const published = classify(versions.get(project.published_version_id))
      findings.push({ projectId: project.id, slug: project.slug, source: 'published', ...published })
    }
  }

  for (const source of ['draft', 'published'] as const) {
    const rows = findings.filter((f) => f.source === source)
    const count = (status: Status) => rows.filter((f) => f.status === status).length
    console.log(`\n== ${source} (${rows.length}) ==`)
    console.log(`valid:        ${count('valid')}`)
    console.log(`repaired:     ${count('repaired')}`)
    console.log(`unrepairable: ${count('unrepairable')}`)

    const byClass = new Map<string, { count: number; example: string; projects: Set<string> }>()
    for (const finding of rows.filter((f) => f.status !== 'valid')) {
      for (const entry of new Set(finding.classes.map(classKey))) {
        const slot = byClass.get(entry) ?? { count: 0, example: entry, projects: new Set<string>() }
        slot.count += 1
        slot.projects.add(`${finding.projectId} (${finding.slug ?? '-'}) [${finding.status}]`)
        byClass.set(entry, slot)
      }
    }
    for (const [entry, slot] of [...byClass].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`\n  ${entry}  x${slot.count}`)
      for (const label of [...slot.projects].slice(0, 20)) console.log(`    ${label}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
