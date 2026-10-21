import 'server-only'

import { randomUUID } from 'node:crypto'
import type { WebsiteSchema } from '@/lib/website-schema'
import { generateAboutPreviewImage } from '@/lib/about-image'
import { getCreditBalance } from '@/lib/ai-credits'
import { createSupabasePreviewStore } from '@/lib/ai-preview/store'
import { savePreviewImage, removePreviewImages } from '@/lib/ai-preview/storage'
import type { PreviewDeps } from '@/lib/ai-preview/service'

/** Section keys look like `about:2`; the target decides which generator runs. */
export function parseSectionKey(sectionKey: string): { target: string; index: number } | null {
  const match = /^([a-z]+):(\d{1,3})$/.exec(sectionKey)
  return match ? { target: match[1], index: Number(match[2]) } : null
}

export const SUPPORTED_TARGETS = ['about'] as const

/**
 * Real dependencies for one request. `beforeGenerate` runs right before the
 * provider call (free-plan daily gate); returning false aborts without a charge.
 */
export function createPreviewDeps(args: {
  site: WebsiteSchema
  beforeGenerate: () => Promise<boolean>
}): PreviewDeps {
  return {
    store: createSupabasePreviewStore(),
    credits: { balance: getCreditBalance },
    async generate({ sectionKey, request }) {
      const parsed = parseSectionKey(sectionKey)
      if (!parsed || parsed.target !== 'about') return null
      if (!(await args.beforeGenerate())) return null
      return generateAboutPreviewImage(args.site, parsed.index, request)
    },
    storage: { save: savePreviewImage, remove: removePreviewImages },
    now: () => Date.now(),
    newId: () => randomUUID(),
  }
}
