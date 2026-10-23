import 'server-only'

import { randomUUID } from 'node:crypto'
import type { WebsiteSchema } from '@/lib/website-schema'
import { generateAboutPreviewImage } from '@/lib/about-image'
import { generateServicePreviewImage } from '@/lib/service-image-generate'
import { generateProductPreviewImage, generateProductsBannerPreviewImage } from '@/lib/product-image'
import { getCreditBalance } from '@/lib/ai-credits'
import { createSupabasePreviewStore } from '@/lib/ai-preview/store'
import { savePreviewImage, removePreviewImages } from '@/lib/ai-preview/storage'
import type { PreviewDeps } from '@/lib/ai-preview/service'

/**
 * Section keys look like `about:2` or, for one item of a collection,
 * `services:2.1` (section 2, item 1); the target decides which generator runs.
 */
export function parseSectionKey(sectionKey: string): { target: string; index: number; item?: number } | null {
  const match = /^([a-z]+):(\d{1,3})(?:\.(\d{1,2}))?$/.exec(sectionKey)
  if (!match) return null
  const base = { target: match[1], index: Number(match[2]) }
  return match[3] === undefined ? base : { ...base, item: Number(match[3]) }
}

export { SUPPORTED_TARGETS, previewDbTarget } from '@/lib/ai-preview/policy'

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
      if (!parsed) return null
      if (parsed.target === 'about') {
        if (!(await args.beforeGenerate())) return null
        return generateAboutPreviewImage(args.site, parsed.index, request)
      }
      if (parsed.target === 'services' && parsed.item !== undefined) {
        if (!(await args.beforeGenerate())) return null
        return generateServicePreviewImage(args.site, parsed.index, parsed.item, request)
      }
      if (parsed.target === 'productsbanner' && parsed.item === undefined) {
        if (!(await args.beforeGenerate())) return null
        return generateProductsBannerPreviewImage(args.site, parsed.index, request)
      }
      if (parsed.target === 'products' && parsed.item !== undefined) {
        if (!(await args.beforeGenerate())) return null
        return generateProductPreviewImage(args.site, parsed.index, parsed.item, request)
      }
      return null
    },
    storage: { save: savePreviewImage, remove: removePreviewImages },
    now: () => Date.now(),
    newId: () => randomUUID(),
  }
}
