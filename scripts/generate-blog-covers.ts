import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { originalPosts } from './blog-originals'
import { DEFAULT_COVER_MODEL } from '../lib/blog-cover'
import { inspectCover } from '../lib/blog-cover-inspect'
import { runCoverGeneration } from '../lib/blog-cover-run'
import { getImageProvider, imageGenerationAvailable } from '../lib/image-provider'
import { BLOG_UPLOAD_MAX_BYTES, inspectUpload, randomBlogImagePath } from '../lib/blog-upload'
import { BUCKET, ensureBucket } from '../lib/image-storage'

/**
 * Server-side cover run for the rewritten platform posts. It uses the same
 * pipeline as /api/admin/blog/cover (concepts -> flux image -> text/people
 * check) and the SAME admin AI rate-limit counters (5 per 10 min, 30 per day);
 * when a window is full it waits for the reset instead of bypassing it.
 * Posts that already have a cover are skipped, so it can be re-run safely.
 */

const HELD_BACK = new Set([
  'gloval-ai-ile-e-ticaret-magazasi-kurma',
  'gloval-ai-ile-kendi-alan-adini-baglama',
  'odeme-guvenligi-ve-guven-unsurlari',
  'gizlilik-ve-kvkk-sayfasi-neden-gerekir',
])
const WINDOWS = [
  { seconds: 600, limit: 5 },
  { seconds: 86_400, limit: 30 },
]
const PALETTE = ['soft blue', 'warm sand', 'deep navy']

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(url, key, { auth: { persistSession: false } })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function adminUserId(): Promise<string> {
  const emails = (process.env.ADMIN_EMAILS ?? '')
    .replace(/^["']+|["']+$/g, '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const hit = data.users.find((u) => u.email && emails.includes(u.email.toLowerCase()))
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  throw new Error('No admin user found for ADMIN_EMAILS')
}

/** Same counters as checkBlogAdminLimit('ai'); returns seconds to wait, or 0 when reserved. */
async function reserveAiSlot(userId: string): Promise<number> {
  for (const window of WINDOWS) {
    const { data, error } = await supabase
      .rpc('reserve_rate_limit', {
        p_subject: `blogadm:ai:${window.seconds}:${userId}`,
        p_limit: window.limit,
        p_window_seconds: window.seconds,
      })
      .maybeSingle()
    if (error || !data) throw new Error(`reserve_rate_limit: ${error?.message ?? 'no row'}`)
    const row = data as { allowed: boolean; reset_at?: string }
    if (!row.allowed) {
      const resetMs = row.reset_at ? Date.parse(row.reset_at) - Date.now() : window.seconds * 1000
      return Math.max(1, Math.ceil(resetMs / 1000))
    }
  }
  return 0
}

async function completeConcepts({ system, prompt }: { system: string; prompt: string }): Promise<string> {
  const { generateText } = await import('ai')
  const { text } = await generateText({
    model: process.env.BLOG_COVER_CONCEPT_MODEL || 'google/gemini-2.5-flash-lite',
    system,
    prompt,
    maxOutputTokens: 80,
    temperature: 0.3,
    abortSignal: AbortSignal.timeout(10_000),
  })
  return text
}

async function persistRandom(src: string): Promise<string> {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(src)
  if (!match) throw new Error('not a data uri')
  const bytes = new Uint8Array(Buffer.from(match[2], 'base64'))
  if (bytes.length > BLOG_UPLOAD_MAX_BYTES) throw new Error('too_large')
  const inspected = inspectUpload(bytes)
  if (!inspected.ok) throw new Error(inspected.error)
  await ensureBucket(supabase)
  const path = randomBlogImagePath(inspected.kind.ext, randomUUID())
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: inspected.kind.mime,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

async function main() {
  if (!imageGenerationAvailable()) throw new Error('Image generation is not available (AI gateway key missing)')
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
  const userId = await adminUserId()
  const model = process.env.BLOG_COVER_IMAGE_MODEL || DEFAULT_COVER_MODEL
  const provider = getImageProvider()

  const posts = originalPosts.filter((p) => !HELD_BACK.has(p.slug) && (!only || p.slug === only))
  const failed: Array<{ slug: string; error: string }> = []
  let done = 0
  let skipped = 0

  for (const post of posts) {
    const { data: row, error } = await supabase
      .from('platform_blog_posts')
      .select('id, title, excerpt, cover_url, status')
      .eq('slug', post.slug)
      .maybeSingle()
    if (error || !row) {
      failed.push({ slug: post.slug, error: error?.message ?? 'not found' })
      continue
    }
    if (row.cover_url) {
      skipped++
      continue
    }

    let result: Awaited<ReturnType<typeof runCoverGeneration>> | null = null
    for (let tries = 0; tries < 3; tries++) {
      for (;;) {
        const wait = await reserveAiSlot(userId)
        if (wait === 0) break
        console.log(`[limit] ${post.slug}: waiting ${wait}s`)
        await sleep(Math.min(wait, 900) * 1000 + 2000)
      }
      result = await runCoverGeneration(
        {
          getBalance: async () => Number.MAX_SAFE_INTEGER,
          concepts: completeConcepts,
          generate: (prompt) => provider.generate({ prompt, aspectRatio: '16:9', allowText: true, model }),
          inspect: inspectCover,
          persist: persistRandom,
          charge: async () => ({ ok: true, balance: 0 }),
        },
        { title: row.title, excerpt: row.excerpt ?? '', style: 'flat', colors: PALETTE, cost: 0, reason: 'platformBlogCover' },
      )
      if (result.ok) break
      console.log(`[retry] ${post.slug}: ${result.error}`)
    }

    if (!result || !result.ok) {
      failed.push({ slug: post.slug, error: result && !result.ok ? result.error : 'unknown' })
      continue
    }
    const { error: updateError } = await supabase
      .from('platform_blog_posts')
      .update({ cover_url: result.url, cover_alt: `${row.title} yazısı için sade, yazısız bir konu illüstrasyonu` })
      .eq('id', row.id)
      .is('cover_url', null)
    if (updateError) {
      failed.push({ slug: post.slug, error: updateError.message })
      continue
    }
    done++
    console.log(`[ok] ${post.slug} (${result.attempts} attempt, concepts: ${result.conceptSource}) ${result.url}`)
  }
  console.log(JSON.stringify({ generated: done, skipped, failed }))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
