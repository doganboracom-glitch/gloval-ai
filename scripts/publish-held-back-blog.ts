import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { originalPosts } from './blog-originals'
import { DEFAULT_COVER_MODEL } from '../lib/blog-cover'
import { inspectCover } from '../lib/blog-cover-inspect'
import { runCoverGeneration } from '../lib/blog-cover-run'
import { getImageProvider, imageGenerationAvailable } from '../lib/image-provider'
import { BLOG_UPLOAD_MAX_BYTES, inspectUpload, randomBlogImagePath } from '../lib/blog-upload'
import { BUCKET, ensureBucket } from '../lib/image-storage'

const TARGETS = [
  'gloval-ai-ile-e-ticaret-magazasi-kurma',
  'gloval-ai-ile-kendi-alan-adini-baglama',
  'odeme-guvenligi-ve-guven-unsurlari',
  'gizlilik-ve-kvkk-sayfasi-neden-gerekir',
] as const
const FIRST_PUBLISH_UTC = Date.UTC(2026, 9, 22, 6)
const STEP_MS = 2 * 24 * 60 * 60 * 1000
const forbidden = /(?:araştırmalara göre|en iyi|1\s*numara|ödül|müşteri yorumu|iyzico|kredi kartı|banka kartı|webmail|ceza tutarı|madde\s*\d+)/iu

function prepareBody(post: (typeof originalPosts)[number]) {
  let body = post.body
  if (post.slug === 'gloval-ai-ile-kendi-alan-adini-baglama') {
    body = body.replace(/Bu rehber genel bir çerçeve sunar[\\s\\S]*?güncel durumu dashboard'daki[^\\n]*/iu, 'Bu rehber, dashboarddaki alan adı bağlantı akışını ve kendi sağlayıcınızda yapacağınız DNS ayarlarını genel hatlarıyla açıklar. Ekranda gösterilen güncel yönlendirmeleri esas alın.')
  }
  if (post.slug === 'odeme-guvenligi-ve-guven-unsurlari' && !body.includes('(/blog')) body += '\\n\\nGüvenli mağaza hazırlama ve içerik kontrolü için [blog arşivimizi](/blog) inceleyebilirsiniz.'
  if (post.slug === 'gizlilik-ve-kvkk-sayfasi-neden-gerekir' && !/hukuki tavsiye değildir.*uzmana danışın/iu.test(body)) body += '\\n\\nBu yazı hukuki tavsiye değildir; işletmenize özel değerlendirme için bir uzmana danışın.'
  return body
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(url, key, { auth: { persistSession: false } })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function adminId() {
  const emails = (process.env.ADMIN_EMAILS ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const user = data.users.find((candidate) => candidate.email && emails.includes(candidate.email.toLowerCase()))
    if (user) return { id: user.id, email: user.email ?? emails[0] }
    if (data.users.length < 200) break
  }
  throw new Error('No admin user found for ADMIN_EMAILS')
}

async function concept(prompt: string) {
  const { generateText } = await import('ai')
  const { text } = await generateText({
    model: process.env.BLOG_COVER_CONCEPT_MODEL || 'google/gemini-2.5-flash-lite',
    system: 'Return one concise visual concept. No text, logos, people, faces, letters, or numbers in the image.',
    prompt,
    maxOutputTokens: 80,
    temperature: 0.3,
    abortSignal: AbortSignal.timeout(10_000),
  })
  return text
}

async function persist(src: string) {
  const match = /^data:([^;]+);base64,([\\s\\S]+)$/.exec(src)
  if (!match) throw new Error('cover is not a data URI')
  const bytes = new Uint8Array(Buffer.from(match[2], 'base64'))
  if (bytes.length > BLOG_UPLOAD_MAX_BYTES) throw new Error('cover is too large')
  const inspected = inspectUpload(bytes)
  if (!inspected.ok) throw new Error(inspected.error)
  await ensureBucket(supabase)
  const path = randomBlogImagePath(inspected.kind.ext, randomUUID())
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: inspected.kind.mime, cacheControl: '31536000', upsert: false })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const sources = TARGETS.map((slug) => originalPosts.find((post) => post.slug === slug))
  if (sources.some((post) => !post)) throw new Error('A target post is missing from blog-originals')
  const posts = sources as NonNullable<(typeof sources)[number]>[]
  const { data: rows, error } = await supabase.from('platform_blog_posts').select('id, slug, title, excerpt, body, status, cover_url').in('slug', TARGETS)
  if (error) throw error
  if (rows.length !== TARGETS.length) throw new Error(`Expected ${TARGETS.length} rows, found ${rows.length}`)
  const problems: string[] = []
  const preparedBodies = new Map(posts.map((post) => [post.slug, prepareBody(post)]))
  for (const post of posts) {
    const body = preparedBodies.get(post.slug)!
    const words = body.trim().split(/\s+/u).length
    if (words < 800 || words > 1200) problems.push(`${post.slug}: ${words} words`)
    if (forbidden.test(body)) problems.push(`${post.slug}: forbidden claim or provider mention`)
    if (!body.includes('(/blog')) problems.push(`${post.slug}: missing internal blog link`)
    if (post.slug === 'gizlilik-ve-kvkk-sayfasi-neden-gerekir' && !/hukuki tavsiye değildir.*uzmana danışın/iu.test(body)) problems.push(`${post.slug}: missing legal disclaimer`)
  }
  if (problems.length) throw new Error(problems.join('\n'))
  if (dryRun) { console.log(JSON.stringify({ targets: TARGETS, publishAt: TARGETS.map((_, i) => new Date(FIRST_PUBLISH_UTC + i * STEP_MS).toISOString()) })); return }
  if (!imageGenerationAvailable()) throw new Error('Image generation is unavailable')
  const actor = await adminId()
  const provider = getImageProvider()
  await ensureBucket(supabase)

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    const body = preparedBodies.get(post.slug)!
    const row = rows.find((candidate) => candidate.slug === post.slug)!
    let coverUrl = row.cover_url
    if (!coverUrl) {
      const result = await runCoverGeneration({
        getBalance: async () => Number.MAX_SAFE_INTEGER,
        concepts: ({ prompt }) => concept(prompt),
        generate: (prompt) => provider.generate({ prompt, aspectRatio: '16:9', allowText: false, model: process.env.BLOG_COVER_IMAGE_MODEL || DEFAULT_COVER_MODEL }),
        inspect: inspectCover,
        persist,
        charge: async () => ({ ok: true, balance: 0 }),
      }, { title: post.title, excerpt: post.excerpt, style: 'flat', colors: ['soft blue', 'warm sand', 'deep navy'], cost: 0, reason: 'platformBlogCover' })
      if (!result.ok) throw new Error(`${post.slug}: cover failed: ${result.error}`)
      coverUrl = result.url
    }
    const publishedAt = new Date(FIRST_PUBLISH_UTC + i * STEP_MS).toISOString()
    const { error: updateError } = await supabase.from('platform_blog_posts').update({ body, excerpt: post.excerpt, cover_url: coverUrl, cover_alt: `${post.title} yazısı için sade, yazısız bir konu illüstrasyonu`, published_at: publishedAt, status: 'published', indexable: true }).eq('id', row.id).eq('status', 'draft')
    if (updateError) throw updateError
    await supabase.from('platform_blog_audit').insert({ actor_id: actor.id, actor_email: actor.email, action: 'post.publish', post_id: row.id, post_slug: post.slug, post_title: post.title, detail: { source: 'scripts/publish-held-back-blog.ts', publishedAt } })
    console.log(`[ok] ${post.slug} ${publishedAt}`)
    await sleep(100)
  }
  console.log(JSON.stringify({ published: posts.length }))
}

main().catch((error) => { console.error(error); process.exit(1) })
