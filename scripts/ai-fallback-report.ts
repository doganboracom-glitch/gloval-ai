/**
 * Weekly AI outcome report from the `ai_generation_events` table.
 *
 *   set -a && source /vercel/share/.env.project && set +a
 *   npx tsx scripts/ai-fallback-report.ts [--weeks=8]
 *
 * Read-only, developer-only (not a route). Needs the service-role key and the
 * table from scripts/054-ai-generation-events.sql.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { readAiWeeklyReport } from '@/lib/ai-generation-events'

async function main() {
  const weeksArg = process.argv.find((arg) => arg.startsWith('--weeks='))
  const weeks = Math.min(52, Math.max(1, Number(weeksArg?.split('=')[1]) || 8))
  const rows = await readAiWeeklyReport(createAdminClient(), weeks, Date.now())
  if (!rows.length) {
    console.log(`No AI generation events in the last ${weeks} weeks.`)
    return
  }
  console.log('week        flow          tier      model                          total   ok  rep  retry  fb  fb%')
  for (const r of rows) {
    console.log(
      [
        r.week.padEnd(11),
        r.flow.padEnd(13),
        r.tier.padEnd(9),
        r.model.padEnd(30),
        String(r.total).padStart(5),
        String(r.ok).padStart(4),
        String(r.repaired).padStart(4),
        String(r.retried).padStart(6),
        String(r.fallback).padStart(3),
        `${r.fallback_pct}%`.padStart(6),
      ].join(' '),
    )
  }
}

main().catch((error) => {
  console.error('Report failed:', error instanceof Error ? error.message : 'unknown')
  process.exit(1)
})
