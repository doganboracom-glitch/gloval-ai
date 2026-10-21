import type { WebsiteSchema } from '@/lib/website-schema'
import { cleanDetailBlocks, type DetailBlock } from '@/lib/section-detail'
import { findServicesSection, type ServiceItem } from '@/lib/service-pages'
import { collectReusableImages, isUsableImageSrc } from '@/lib/about-media'
import { STARTER_DAILY_SITE_CAP } from '@/lib/starter-blog'
import type { ServiceDetailWrite } from '@/lib/service-detail-ai'

/**
 * Background service-page text for a freshly created site. Pure orchestration:
 * every side effect (database, model, quota) is injected, so the guarantees
 * below are testable without any of them:
 *  - idempotent: only items with NO detail blocks are ever written, so a second
 *    run (or an owner who already wrote text) changes nothing;
 *  - capped: a daily site cap stops the model calls, never site creation;
 *  - never throws: any failure is reported as a result, the site stays usable.
 */

export type ServiceBackgroundResult =
  | { status: 'done'; written: number; images: number }
  | { status: 'skipped'; reason: 'no_section' | 'detail_off' | 'nothing_to_do' | 'daily_cap' }
  | { status: 'failed'; reason: 'load' | 'save' | 'unexpected' }

export type ServiceBackgroundDeps = {
  load(): Promise<{ site: WebsiteSchema; version: string } | null>
  /** Compare-and-set: false when the draft changed since `version` was read. */
  save(site: WebsiteSchema, version: string): Promise<boolean>
  write(site: WebsiteSchema, itemIndex: number): Promise<ServiceDetailWrite>
  /** Sites this owner created in the last 24h, the new one included. */
  sitesLast24h(): Promise<number>
}

/** The new site counts itself, so the cap trips only on the Nth+1 site of the day. */
export function serviceDetailDailyCapReached(sitesLast24h: number): boolean {
  return sitesLast24h > STARTER_DAILY_SITE_CAP
}

const hasText = (item: ServiceItem) => cleanDetailBlocks(item.detail).length > 0

export function itemsNeedingText(site: Pick<WebsiteSchema, 'sections'>): number[] {
  const section = findServicesSection(site)
  if (!section?.detail || section.hidden) return []
  return section.items.flatMap((item, index) => (item.pageEnabled === false || hasText(item) ? [] : [index]))
}

/**
 * Free image step: an item with no picture borrows one the site already owns
 * (gallery, portfolio, slider, hero) that no other service uses yet. Items with
 * no candidate left keep the renderer's placeholder card. Returns how many got one.
 */
export function fillServiceImages(site: WebsiteSchema): { site: WebsiteSchema; filled: number } {
  const section = findServicesSection(site)
  if (!section) return { site, filled: 0 }
  const used = new Set(section.items.map((i) => i.src?.trim()).filter(Boolean) as string[])
  const pool = collectReusableImages(site).filter((c) => !used.has(c.src))
  let filled = 0
  const items = section.items.map((item) => {
    if (isUsableImageSrc(item.src) || item.pageEnabled === false) return item
    const candidate = pool.shift()
    if (!candidate) return item
    filled += 1
    return { ...item, src: candidate.src, alt: `${item.title.trim() || candidate.alt} - ${site.meta.name}`.slice(0, 200) }
  })
  if (!filled) return { site, filled: 0 }
  return { site: { ...site, sections: site.sections.map((s) => (s === section ? { ...section, items } : s)) }, filled }
}

type Written = Map<number, { title: string; blocks: DetailBlock[] }>

/** Merges generated text into the LATEST draft; an item the owner touched meanwhile is skipped. */
export function applyServiceText(site: WebsiteSchema, written: Written): { site: WebsiteSchema; applied: number } {
  const section = findServicesSection(site)
  if (!section) return { site, applied: 0 }
  let applied = 0
  const items = section.items.map((item, index) => {
    const entry = written.get(index)
    if (!entry || entry.title !== item.title || hasText(item) || item.pageEnabled === false) return item
    applied += 1
    return { ...item, detail: entry.blocks, sample: true }
  })
  if (!applied) return { site, applied: 0 }
  return { site: { ...site, sections: site.sections.map((s) => (s === section ? { ...section, items } : s)) }, applied }
}

export async function runServiceDetailBackground(deps: ServiceBackgroundDeps): Promise<ServiceBackgroundResult> {
  try {
    const first = await deps.load()
    if (!first) return { status: 'failed', reason: 'load' }
    const section = findServicesSection(first.site)
    if (!section) return { status: 'skipped', reason: 'no_section' }
    if (!section.detail) return { status: 'skipped', reason: 'detail_off' }

    const targets = itemsNeedingText(first.site)
    const imagesNeeded = fillServiceImages(first.site).filled > 0
    if (!targets.length && !imagesNeeded) return { status: 'skipped', reason: 'nothing_to_do' }

    const written: Written = new Map()
    const capped = targets.length > 0 && serviceDetailDailyCapReached(await deps.sitesLast24h())
    if (capped && !imagesNeeded) return { status: 'skipped', reason: 'daily_cap' }
    if (!capped) {
      for (const index of targets) {
        const result = await deps.write(first.site, index)
        if (result.written && result.blocks.length) {
          written.set(index, { title: section.items[index].title, blocks: result.blocks })
        }
      }
    }

    // Two attempts: the owner may save the draft while the model is writing.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = attempt === 0 ? first : await deps.load()
      if (!current) return { status: 'failed', reason: 'load' }
      const text = applyServiceText(current.site, written)
      const pictures = fillServiceImages(text.site)
      if (!text.applied && !pictures.filled) {
        return { status: 'skipped', reason: 'nothing_to_do' }
      }
      if (await deps.save(pictures.site, current.version)) {
        return { status: 'done', written: text.applied, images: pictures.filled }
      }
    }
    return { status: 'failed', reason: 'save' }
  } catch (err) {
    console.log('[service-detail] background run failed:', err instanceof Error ? err.message : 'unknown')
    return { status: 'failed', reason: 'unexpected' }
  }
}
