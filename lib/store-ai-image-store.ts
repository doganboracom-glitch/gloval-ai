import 'server-only'

import { BUCKET, ensureBucket } from '@/lib/image-storage'
import { CANDIDATE_PREFIX, type CandidateStore } from '@/lib/store-ai-image'
import { createAdminClient } from '@/lib/supabase/admin'

/** Candidates live in the existing `site-images` bucket under `ai-candidates/<projectId>/`. */
export function createCandidateStore(): CandidateStore {
  const client = createAdminClient()
  let ready = false

  return {
    async put(path, bytes, contentType) {
      try {
        if (!ready) {
          await ensureBucket(client)
          ready = true
        }
        const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
          contentType,
          cacheControl: '3600',
          upsert: false,
        })
        return error ? { error: error.message } : {}
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'upload_failed' }
      }
    },
    async get(path) {
      const { data, error } = await client.storage.from(BUCKET).download(path)
      if (error || !data) return null
      return Buffer.from(await data.arrayBuffer())
    },
    async remove(paths) {
      const { error } = await client.storage.from(BUCKET).remove(paths)
      return error ? { error: error.message } : {}
    },
    publicUrl(path) {
      return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    },
    async listProjects() {
      const { data, error } = await client.storage.from(BUCKET).list(CANDIDATE_PREFIX, { limit: 1000 })
      if (error) throw new Error(error.message)
      return (data ?? []).map((item) => item.name)
    },
    async listProject(projectId) {
      const { data, error } = await client.storage
        .from(BUCKET)
        .list(`${CANDIDATE_PREFIX}/${projectId}`, { limit: 1000 })
      if (error) throw new Error(error.message)
      return (data ?? []).map((item) => ({
        path: `${CANDIDATE_PREFIX}/${projectId}/${item.name}`,
        createdAt: Date.parse(item.created_at ?? item.updated_at ?? '') || 0,
      }))
    },
  }
}
