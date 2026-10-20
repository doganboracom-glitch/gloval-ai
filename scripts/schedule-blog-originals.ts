import { createClient } from '@supabase/supabase-js'
import { originalPosts } from './blog-originals'

const HELD_BACK = new Set([
  'gloval-ai-ile-e-ticaret-magazasi-kurma',
  'gloval-ai-ile-kendi-alan-adini-baglama',
  'odeme-guvenligi-ve-guven-unsurlari',
  'gizlilik-ve-kvkk-sayfasi-neden-gerekir',
])
const FIRST_SLUG = 'gloval-ai-nedir-ve-kimler-icin'
const NEWEST_UTC = Date.UTC(2026, 9, 20, 6, 0, 0) // 20 Oct 2026 09:00 Europe/Istanbul (UTC+3)
const STEP_MS = 2 * 24 * 60 * 60 * 1000

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(url, key, { auth: { persistSession: false } })

export function scheduleOrder() {
  const pool = originalPosts.filter((post) => !HELD_BACK.has(post.slug))
  const first = pool.find((post) => post.slug === FIRST_SLUG)
  if (!first) throw new Error(`${FIRST_SLUG} not found`)
  const rest = pool.filter((post) => post !== first)
  const ordered = [first]
  while (rest.length) {
    const previous = ordered[ordered.length - 1].category
    const remaining = new Map<string, number>()
    for (const post of rest) remaining.set(post.category, (remaining.get(post.category) ?? 0) + 1)
    const candidates = [...remaining.entries()].sort((a, b) => b[1] - a[1])
    const pick = (candidates.find(([category]) => category !== previous) ?? candidates[0])[0]
    const index = rest.findIndex((post) => post.category === pick)
    ordered.push(rest.splice(index, 1)[0])
  }
  return ordered
}

async function main() {
  const ordered = scheduleOrder()
  const dryRun = process.argv.includes('--dry-run')
  if (NEWEST_UTC > Date.now()) console.warn('WARNING: newest date is still in the future; wait until 09:00 Istanbul before publishing')

  const plan = ordered.map((post, index) => ({
    slug: post.slug,
    category: post.category,
    publishedAt: new Date(NEWEST_UTC - index * STEP_MS).toISOString(),
  }))
  if (dryRun) {
    for (const row of plan) console.log(row.publishedAt, row.category.padEnd(11), row.slug)
    return
  }

  for (const row of plan) {
    const { error } = await supabase
      .from('platform_blog_posts')
      .update({ published_at: row.publishedAt })
      .eq('slug', row.slug)
      .eq('status', 'draft')
    if (error) throw new Error(`${row.slug}: ${error.message}`)
  }
  console.log(JSON.stringify({ scheduled: plan.length, newest: plan[0].publishedAt, oldest: plan[plan.length - 1].publishedAt }))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
