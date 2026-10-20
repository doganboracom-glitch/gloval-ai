import { createClient } from '@supabase/supabase-js'
import { approvedPosts } from './platform-blog-approved'
import { staticCategories } from '../lib/content/blog-static'
import { blocksToMarkup, readingTimeMinutes } from '../lib/blog-markup'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, key, { auth: { persistSession: false } })
const allowedInternalPaths = new Set(['/'])
const linkPattern = /\]\((\/[^)\s]+)\)/g

export function validateApprovedPost(post: (typeof approvedPosts)[number]) {
  const body = blocksToMarkup(post.body, 'tr')
  for (const match of body.matchAll(linkPattern)) {
    if (!allowedInternalPaths.has(match[1])) throw new Error(`${post.slug}: invalid internal link ${match[1]}`)
  }
  const words = body.replace(/[#*\[\]()]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  if (words < 800 || words > 1200) throw new Error(`${post.slug}: ${words} words, expected 800-1200`)
  if (post.category !== 'ai' && post.category !== 'web-design' && post.category !== 'seo') throw new Error(`${post.slug}: invalid category`)
}

async function main() {
  approvedPosts.forEach(validateApprovedPost)
  const categoryRows = staticCategories.map((category, index) => ({ slug: category.id, name: category.label.tr ?? category.label.en, sort_order: index }))
  const categoriesResult = await supabase.from('platform_blog_categories').upsert(categoryRows, { onConflict: 'slug', ignoreDuplicates: true })
  if (categoriesResult.error) throw categoriesResult.error
  const { data: categories, error: categoriesError } = await supabase.from('platform_blog_categories').select('id, slug')
  if (categoriesError) throw categoriesError
  const categoryId = new Map((categories ?? []).map((c) => [c.slug as string, c.id as string]))
  const postRows = approvedPosts.map((post) => {
    const body = blocksToMarkup(post.body, 'tr')
    const publishedAt = '2026-10-20T00:00:00.000Z'
    return {
      slug: post.slug,
      title: post.title.tr ?? post.title.en,
      excerpt: post.excerpt.tr ?? post.excerpt.en,
      body,
      category_id: categoryId.get(post.category) ?? null,
      tags: post.keywords.tr ?? post.keywords.en,
      cover_url: null,
      cover_alt: null,
      seo_title: post.seoTitle.tr ?? post.seoTitle.en,
      meta_description: post.seoDescription.tr ?? post.seoDescription.en,
      status: 'draft',
      published_at: null,
      author_name: post.author,
      reading_time: readingTimeMinutes(body),
      language: 'tr',
      featured: false,
      translations: {},
      created_at: publishedAt,
      updated_at: publishedAt,
    }
  })
  const postsResult = await supabase.from('platform_blog_posts').upsert(postRows, { onConflict: 'slug', ignoreDuplicates: true })
  if (postsResult.error) throw postsResult.error
  const { count: total } = await supabase.from('platform_blog_posts').select('id', { count: 'exact', head: true })
  const { count: drafts } = await supabase.from('platform_blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'draft')
  const { count: published } = await supabase.from('platform_blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published')
  console.log(JSON.stringify({ total, drafts, published, imported: approvedPosts.length }))
}

if (process.argv[1]?.endsWith('import-platform-blog-approved.ts')) main().catch((error) => { console.error(error); process.exit(1) })
