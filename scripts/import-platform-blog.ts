/**
 * One-time import of the file-based blog (lib/content/blog-static.ts) into
 * platform_blog_categories / platform_blog_posts.
 *
 * Idempotent: rows are keyed by slug and existing rows are left untouched
 * (`ignoreDuplicates`), so a re-run never duplicates posts or overwrites edits
 * made in the admin.
 *
 *   node --env-file=/vercel/share/.env.project --import tsx scripts/import-platform-blog.ts
 */
import { createClient } from '@supabase/supabase-js'
import { staticCategories, staticPosts } from '../lib/content/blog-static'
import { blocksToMarkup, readingTimeMinutes } from '../lib/blog-markup'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const categoryRows = staticCategories.map((category, index) => ({
    slug: category.id,
    name: category.label.tr ?? category.label.en,
    sort_order: index,
  }))
  const categoryResult = await supabase
    .from('platform_blog_categories')
    .upsert(categoryRows, { onConflict: 'slug', ignoreDuplicates: true })
  if (categoryResult.error) throw categoryResult.error

  const { data: categories, error } = await supabase.from('platform_blog_categories').select('id, slug')
  if (error) throw error
  const categoryId = new Map((categories ?? []).map((c) => [c.slug as string, c.id as string]))

  const postRows = staticPosts.map((post) => {
    const trBody = blocksToMarkup(post.body, 'tr')
    const publishedAt = `${post.publishedAt}T00:00:00.000Z`
    return {
      slug: post.slug,
      title: post.title.tr ?? post.title.en,
      excerpt: post.excerpt.tr ?? post.excerpt.en,
      body: trBody,
      category_id: categoryId.get(post.category) ?? null,
      tags: post.keywords.tr ?? post.keywords.en,
      seo_title: post.seoTitle.tr ?? post.seoTitle.en,
      meta_description: post.seoDescription.tr ?? post.seoDescription.en,
      status: 'published',
      published_at: publishedAt,
      author_name: post.author,
      reading_time: readingTimeMinutes(trBody),
      language: 'tr',
      featured: post.featured,
      translations: {
        en: {
          title: post.title.en,
          excerpt: post.excerpt.en,
          body: blocksToMarkup(post.body, 'en'),
          seo_title: post.seoTitle.en,
          meta_description: post.seoDescription.en,
        },
      },
      created_at: publishedAt,
      updated_at: `${post.updatedAt}T00:00:00.000Z`,
    }
  })
  const postResult = await supabase
    .from('platform_blog_posts')
    .upsert(postRows, { onConflict: 'slug', ignoreDuplicates: true })
  if (postResult.error) throw postResult.error

  const { count } = await supabase.from('platform_blog_posts').select('*', { count: 'exact', head: true })
  console.log(`Imported. platform_blog_posts now has ${count} rows (source has ${staticPosts.length}).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
