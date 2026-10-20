import { createClient } from '@supabase/supabase-js'
import { originalPosts } from './blog-originals'

const HELD_BACK = new Set([
  'gloval-ai-ile-e-ticaret-magazasi-kurma',
  'gloval-ai-ile-kendi-alan-adini-baglama',
  'odeme-guvenligi-ve-guven-unsurlari',
  'gizlilik-ve-kvkk-sayfasi-neden-gerekir',
])

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(url, key, { auth: { persistSession: false } })

async function resolveActor() {
  const email = (process.env.ADMIN_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)[0]
  if (!email) throw new Error('ADMIN_EMAILS is empty')
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email)
    if (user) return { userId: user.id, email }
    if (data.users.length < 200) break
  }
  throw new Error('Admin user not found')
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const slugs = originalPosts.map((post) => post.slug).filter((slug) => !HELD_BACK.has(slug))
  const { data: rows, error } = await supabase
    .from('platform_blog_posts')
    .select('id, slug, title, status, cover_url, cover_alt, published_at')
    .in('slug', slugs)
  if (error) throw error
  const problems: string[] = []
  if (rows.length !== slugs.length) problems.push(`expected ${slugs.length} rows, found ${rows.length}`)
  const now = Date.now()
  for (const row of rows) {
    if (row.status !== 'draft') problems.push(`${row.slug}: status is ${row.status}`)
    if (!row.cover_url) problems.push(`${row.slug}: no cover`)
    if (!row.cover_alt) problems.push(`${row.slug}: no cover alt`)
    if (!row.published_at) problems.push(`${row.slug}: no published_at`)
    else if (new Date(row.published_at).getTime() > now) problems.push(`${row.slug}: published_at is in the future`)
  }
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  if (dryRun) {
    console.log(JSON.stringify({ wouldPublish: rows.length }))
    return
  }

  const actor = await resolveActor()
  let published = 0
  for (const row of rows) {
    const { error: updateError } = await supabase
      .from('platform_blog_posts')
      .update({ status: 'published' })
      .eq('id', row.id)
      .eq('status', 'draft')
    if (updateError) throw new Error(`${row.slug}: ${updateError.message}`)
    const { error: auditError } = await supabase.from('platform_blog_audit').insert({
      actor_id: actor.userId,
      actor_email: actor.email,
      action: 'post.publish',
      post_id: row.id,
      post_slug: row.slug,
      post_title: row.title,
      detail: { status: 'published', previousStatus: 'draft', publishedAt: row.published_at, source: 'scripts/publish-blog-originals.ts' },
    })
    if (auditError) console.error(`${row.slug}: audit failed: ${auditError.message}`)
    published++
  }
  console.log(JSON.stringify({ published }))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
