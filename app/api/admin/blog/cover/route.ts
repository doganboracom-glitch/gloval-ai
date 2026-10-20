import { randomUUID } from 'node:crypto'
import { getAdminUser, requireAdminResponse } from '@/lib/mail/admin-guard'
import { checkBlogAdminLimit } from '@/lib/blog-admin-limit'
import { recordBlogAudit } from '@/lib/blog-audit'
import { BLOG_UPLOAD_MAX_BYTES, inspectUpload, randomBlogImagePath } from '@/lib/blog-upload'
import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKET, ensureBucket, persistImageDataUri } from '@/lib/image-storage'
import { getImageProvider, imageGenerationAvailable } from '@/lib/image-provider'
import { DEFAULT_COVER_MODEL, parseCoverStyle } from '@/lib/blog-cover'
import { inspectCover } from '@/lib/blog-cover-inspect'
import { runCoverGeneration } from '@/lib/blog-cover-run'

export const maxDuration = 180

const CONCEPT_TIMEOUT_MS = 10_000

const tooMany = (retryAfterSeconds: number) =>
  Response.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds), 'Cache-Control': 'no-store' } },
  )

async function completeConcepts({ system, prompt }: { system: string; prompt: string }): Promise<string> {
  const { generateText } = await import('ai')
  const { text } = await generateText({
    model: process.env.BLOG_COVER_CONCEPT_MODEL || 'google/gemini-2.5-flash-lite',
    system,
    prompt,
    maxOutputTokens: 80,
    temperature: 0.3,
    abortSignal: AbortSignal.timeout(CONCEPT_TIMEOUT_MS),
  })
  return text
}

/**
 * Admin-only cover endpoint for the platform blog.
 *  - multipart (`file`): stores an uploaded image under a random name.
 *  - JSON (`title`, `excerpt`, `style`): generates a cover with the same quality
 *    gate as the owner editor. Platform content is not billed, so nothing is
 *    charged.
 * Returns `{ url }`; the post itself is saved through the server actions.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser()
  if (!admin) return requireAdminResponse() as Promise<Response>

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.startsWith('multipart/form-data')) {
    const limit = await checkBlogAdminLimit(admin.userId, 'upload')
    if (!limit.allowed) return tooMany(limit.retryAfterSeconds)

    // Refuse before reading the body when the declared size is already too big.
    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > BLOG_UPLOAD_MAX_BYTES + 64 * 1024) return Response.json({ error: 'too_large' }, { status: 413 })

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'invalid_input' }, { status: 400 })
    if (file.size > BLOG_UPLOAD_MAX_BYTES) return Response.json({ error: 'too_large' }, { status: 413 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const inspected = inspectUpload(bytes)
    if (!inspected.ok) {
      const status = inspected.error === 'too_large' ? 413 : inspected.error === 'unsupported_type' ? 415 : 400
      return Response.json({ error: inspected.error }, { status })
    }

    const client = createAdminClient()
    await ensureBucket(client)
    const path = randomBlogImagePath(inspected.kind.ext, randomUUID())
    const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
      contentType: inspected.kind.mime,
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) return Response.json({ error: 'storage_failed' }, { status: 502 })
    const { data } = client.storage.from(BUCKET).getPublicUrl(path)
    await recordBlogAudit({ actor: admin, action: 'media.upload', detail: { path, bytes: bytes.length } })
    return Response.json({ url: data.publicUrl, path })
  }

  const limit = await checkBlogAdminLimit(admin.userId, 'ai')
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds)

  const body = (await req.json().catch(() => null)) as { title?: string; excerpt?: string; style?: string } | null
  const title = (body?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const excerpt = (body?.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  if (title.length < 3) return Response.json({ error: 'invalid_input' }, { status: 400 })
  if (!imageGenerationAvailable()) return Response.json({ error: 'unavailable' }, { status: 503 })

  const model = process.env.BLOG_COVER_IMAGE_MODEL || DEFAULT_COVER_MODEL
  const provider = getImageProvider()
  const result = await runCoverGeneration(
    {
      getBalance: async () => Number.MAX_SAFE_INTEGER,
      concepts: completeConcepts,
      generate: (prompt) => provider.generate({ prompt, aspectRatio: '16:9', allowText: true, model }),
      inspect: inspectCover,
      persist: persistImageDataUri,
      charge: async () => ({ ok: true, balance: 0 }),
    },
    { title, excerpt, style: parseCoverStyle(body?.style), colors: [], cost: 0, reason: 'platformBlogCover', signal: req.signal },
  )
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json({ url: result.url })
}
