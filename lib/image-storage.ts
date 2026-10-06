import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
 * It is BEST-EFFORT and never throws: if storage is not configured or the
 * upload fails for any reason, the original data URI is returned unchanged, so
 * the image still renders and the pipeline is never broken.
 */

const BUCKET = 'site-images'

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
async function ensureBucket(client: SupabaseClient) {
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
 * Non-data-URI inputs (already a URL) and any failure return the input as-is.
 * Content-addressed by hash so identical images are only stored once.
 */
export async function persistImageDataUri(src: string): Promise<string> {
  if (!src || !src.startsWith('data:')) return src

  const client = adminClient()
  if (!client) return src

  const parsed = parseDataUri(src)
  if (!parsed) return src

  const ext = parsed.mime.split('/')[1]?.replace('+xml', '') || 'png'
  const hash = createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 32)
  const path = `generated/${hash}.${ext}`

  try {
    await ensureBucket(client)
    const { error } = await client.storage.from(BUCKET).upload(path, parsed.buffer, {
      contentType: parsed.mime,
      cacheControl: '31536000',
      upsert: true,
    })
    if (error) {
      console.log('[v0] image-storage: upload error:', error.message)
      return src
    }
    const { data } = client.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl || src
  } catch (err) {
    console.log(
      '[v0] image-storage: persist threw:',
      err instanceof Error ? err.message : err,
    )
    return src
  }
}
