import { websiteSchema } from '@/lib/website-schema'

export const INVALID_SCHEMA_ERROR = 'INVALID_SCHEMA' as const

export const INVALID_SCHEMA_MESSAGE =
  'Sitenizin yapısı geçersiz olduğu için yayınlanmadı. Yayındaki siteniz değişmedi. Son değişikliği geri alıp tekrar deneyin.'

export type PublishGate = { ok: true } | { ok: false; paths: string[] }

/**
 * Publish gate: only a schema the renderer can read exactly as it is may go
 * live. It is strict on purpose (no silent repair on publish), so the public
 * snapshot always equals what the owner saw. Reports field paths, never values.
 */
export function checkPublishable(schema: unknown): PublishGate {
  const result = websiteSchema.safeParse(schema)
  if (result.success) return { ok: true }
  return { ok: false, paths: result.error.issues.map((i) => `${i.path.join('.')}:${i.code}`) }
}
