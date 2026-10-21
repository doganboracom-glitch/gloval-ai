import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { BUCKET, ensureBucket } from '@/lib/image-storage'

/**
 * Temporary storage for preview images. Unlike `persistImageDataUri` there is
 * NO data-URI fallback: a preview that cannot be stored counts as a failed
 * generation (nothing is charged), so the schema can never end up carrying
 * megabytes of base64 and a refresh can always recover the same image.
 */
function client() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function savePreviewImage(
  userId: string,
  name: string,
  image: string,
): Promise<{ url: string; path: string | null } | null> {
  if (/^https?:\/\//i.test(image)) return { url: image, path: null }
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(image)
  const admin = client()
  if (!match || !admin) return null
  const ext = match[1].split('/')[1]?.replace('+xml', '') || 'png'
  const path = `previews/${userId}/${name}.${ext}`
  try {
    await ensureBucket(admin)
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(match[2], 'base64'), { contentType: match[1], cacheControl: '31536000', upsert: true })
    if (error) return null
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl ? { url: data.publicUrl, path } : null
  } catch {
    return null
  }
}

export async function removePreviewImages(paths: string[]): Promise<void> {
  const admin = client()
  const clean = paths.filter((p) => p.startsWith('previews/'))
  if (!admin || clean.length === 0) return
  await admin.storage.from(BUCKET).remove(clean).catch(() => undefined)
}
