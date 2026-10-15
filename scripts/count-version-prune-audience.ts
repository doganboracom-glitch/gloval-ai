/**
 * Read-only: counts Free/Starter owners that would be affected by the 30-day
 * version prune. Prints counts only. No e-mail addresses are read or printed,
 * nothing is written, nothing is sent.
 *
 *   set -a && source /vercel/share/.env.project && set +a
 *   npx tsx scripts/count-version-prune-audience.ts
 */
import { loadPruneAudience } from '@/lib/prune-notice-audience'
import { countByPlan } from '@/lib/prune-notice-audience-core'

async function main() {
  const owners = await loadPruneAudience()
  const counts = countByPlan(owners)
  const versions = [...owners.values()].reduce((sum, o) => sum + o.versions, 0)
  console.log(`FREE owners affected:    ${counts.FREE}`)
  console.log(`STARTER owners affected: ${counts.STARTER}`)
  console.log(`Total owners:            ${owners.size}`)
  console.log(`Prunable versions:       ${versions}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
