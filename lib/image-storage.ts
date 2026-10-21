import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IMAGE_STORAGE_ERROR_CODE, IMAGE_STORAGE_USER_MESSAGE } from '@/lib/image-storage-error'

/**
 * Image storage
 * -------------
 * Generated hero/slider images come back from the provider as large base64
 * data URIs (~2-3 MB each). Carrying those inside the WebsiteSchema means every
 * API response, React state update, autosave and DB row duplicates megabytes of
 * base64 — heavy and wasteful.
 *
 * This module persists a data URI to Supabase Storage ONCE and returns a small,
 * durable public URL, so the schema only ever carries a short string.
 *
 * It FAILS LOUD: if storage is not configured or the upload fails, it throws an
 * `ImageStorageError` instead of handing the raw base64 back. A caller that
 * treated that base64 as success would charge credits for an image that was
 * never stored and write megabytes into the schema and client state.
 */

export const BUCKET = 'site-images'

export { IMAGE_STORAGE_ERROR_CODE, IMAGE_STORAGE_USER_MESSAGE }

export class ImageStorageError extends Error {
  readonly code = IMAGE_STORAGE_ERROR_CODE
  readonly userMessage = IMAGE_STORAGE_USER_MESSAGE
  constructor(detail: string) {
    super(detail)
    this.name = 'ImageStorageError'
  }
}

/** JSON body + status for a route that hit an `ImageStorageError`; never charged. */
export function imageStorageErrorResponse(): Response {
  return Response.json(
    { error: IMAGE_STORAGE_ERROR_CODE, message: IMAGE_STORAGE_USER_MESSAGE, charged: 0 },
    { status: 502 },
  )
}

/** A Supabase admin client (service role) or null when storage isn't configured. */
function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Parses a `data:<mime>;base64,<data>` URI into its parts, or null. */
function parseDataUri(uri: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(uri)
  if (!match) return null
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') }
}

/** Best-effort ensure the public bucket exists. Safe to call repeatedly. */
export async function ensureBucket(client: SupabaseClient) {
  try {
    const { error } = await client.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: '10MB',
    })
    // "already exists" is the expected happy path after first run.
    if (error && !/exist/i.test(error.message)) {
      console.log('[v0] image-storage: createBucket error:', error.message)
    }
  } catch (err) {
    console.log(
      '[v0] image-storage: ensureBucket threw:',
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * Uploads a base64 data URI to Supabase Storage and returns a public URL.
 * Non-data-URI inputs (already a URL) are returned as-is. Every other failure
 * (storage not configured, malformed data URI, upload error, no public URL)
 * logs the technical cause and throws `ImageStorageError`.
 * Content-addressed by hash so identical images are only stored once.
 */
export async function persistImageDataUri(src: string): Promise<string> {
  if (!src || !src.startsWith('data:')) return src

  const fail = (detail: string): never => {
    console.error('[image-storage] persist failed:', detail)
    throw new ImageStorageError(detail)
  }

  const client = adminClient()
  if (!client) return fail('storage is not configured')

  const parsed = parseDataUri(src)
  if (!parsed) return fail('malformed data URI')

  const ext = parsed.mime.split('/')[1]?.replace('+xml', '') || 'png'
  const hash = createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 32)
  const path = `generated/${hash}.${ext}`

  let publicUrl: string | undefined
  try {
    await ensureBucket(client)
    const { error } = await client.storage.from(BUCKET).upload(path, parsed.buffer, {
      contentType: parsed.mime,
      cacheControl: '31536000',
      upsert: true,
    })
    if (error) throw new Error(`upload error: ${error.message}`)
    publicUrl = client.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'unknown storage error')
  }
  if (!publicUrl) return fail('no public URL returned')
  return publicUrl
}
