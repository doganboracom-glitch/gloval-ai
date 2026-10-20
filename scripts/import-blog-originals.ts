import { createClient } from '@supabase/supabase-js'
import { originalPosts } from './blog-originals'
import { readingTimeMinutes } from '../lib/blog-markup'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, key, { auth: { persistSession: false } })
const dryRun = process.argv.includes('--dry-run')

async function main() {
  const { data: categories, error: categoriesError } = await supabase.from('platform_blog_categories').select('id, slug')
  if (categoriesError) throw categoriesError
  const categoryId = new Map((categories ?? []).map((c) => [c.slug as string, c.id as string]))

  const { data: existing, error: existingError } = await supabase.from('platform_blog_posts').select('slug, status')
  if (existingError) throw existingError
  const existingBySlug = new Map((existing ?? []).map((row) => [row.slug as string, row.status as string]))

  const missing = originalPosts.filter((post) => !existingBySlug.has(post.slug)).map((post) => post.slug)
  if (missing.length) throw new Error(`Slugs not found in database: ${missing.join(', ')}`)
  const published = originalPosts.filter((post) => existingBySlug.get(post.slug) === 'published').map((post) => post.slug)
  if (published.length) throw new Error(`Refusing to overwrite published posts: ${published.join(', ')}`)

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, wouldUpdate: originalPosts.length }))
    return
  }

  const now = new Date().toISOString()
  for (const post of originalPosts) {
    const { error } = await supabase
      .from('platform_blog_posts')
      .update({
        title: post.title,
        excerpt: post.excerpt,
        body: post.body,
        category_id: categoryId.get(post.category) ?? null,
        tags: post.tags,
        seo_title: post.seoTitle,
        meta_description: post.seoDescription,
        reading_time: readingTimeMinutes(post.body),
        updated_at: now,
      })
      .eq('slug', post.slug)
      .eq('status', 'draft')
    if (error) throw new Error(`${post.slug}: ${error.message}`)
  }

  const { count: drafts } = await supabase.from('platform_blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'draft')
  const { count: live } = await supabase.from('platform_blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published')
  console.log(JSON.stringify({ updated: originalPosts.length, drafts, published: live }))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
