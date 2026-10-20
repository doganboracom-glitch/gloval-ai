import { randomUUID } from 'node:crypto'
import { requireAdminResponse } from '@/lib/mail/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKET, ensureBucket, persistImageDataUri } from '@/lib/image-storage'
import { getImageProvider, imageGenerationAvailable } from '@/lib/image-provider'
import { DEFAULT_COVER_MODEL, parseCoverStyle } from '@/lib/blog-cover'
import { inspectCover } from '@/lib/blog-cover-inspect'
import { runCoverGeneration } from '@/lib/blog-cover-run'

export const maxDuration = 180

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const CONCEPT_TIMEOUT_MS = 10_000

type ImageKind = { mime: string; ext: string }

/** Identify the real format from magic bytes; the client-supplied MIME type is never trusted. */
function sniffImage(bytes: Buffer): ImageKind | null {
  if (bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' }
  }
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

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
  const denied = await requireAdminResponse()
  if (denied) return denied

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'invalid_input' }, { status: 400 })
    if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: 'too_large' }, { status: 413 })
    const bytes = Buffer.from(await file.arrayBuffer())
    const kind = sniffImage(bytes)
    if (!kind) return Response.json({ error: 'unsupported_type' }, { status: 415 })

    const client = createAdminClient()
    await ensureBucket(client)
    const path = `blog/${randomUUID()}.${kind.ext}`
    const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
      contentType: kind.mime,
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) return Response.json({ error: 'storage_failed' }, { status: 502 })
    const { data } = client.storage.from(BUCKET).getPublicUrl(path)
    return Response.json({ url: data.publicUrl })
  }

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
