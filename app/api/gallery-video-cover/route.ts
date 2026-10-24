import { createClient } from '@/lib/supabase/server'
import { persistImageDataUri } from '@/lib/image-storage'
import { fetchGalleryVideoCover } from '@/lib/gallery-video-cover'
import { parseGalleryVideoUrl } from '@/lib/gallery-video'

export const maxDuration = 60

/**
 * POST /api/gallery-video-cover  { url }
 * Downloads the YouTube thumbnail on the server and stores it. Always answers 200 with
 * `{ cover: { src } | null }` for a valid video address, so a missing thumbnail never blocks adding the video.
 */
export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: unknown }
  if (typeof url !== 'string' || !parseGalleryVideoUrl(url)) {
    return Response.json({ error: 'invalid_url' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const cover = await fetchGalleryVideoCover(url, { persist: persistImageDataUri })
  return Response.json({ cover })
}
