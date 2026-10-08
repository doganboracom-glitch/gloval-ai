import { PAGE_LIMITS, toPlanCode } from '@/lib/pricing-config'

/**
 * Single enforcement layer for the per-plan page limit. The numbers themselves
 * live ONLY in `PAGE_LIMITS` (lib/pricing-config.ts); the pricing cards, the
 * admin package screen, AI generation, the AI editor and the persistence layer
 * all resolve the limit through `pageLimitForPlan`.
 *
 * Rule: a limit only ever blocks GROWTH. A site that already has more pages
 * than its plan allows (e.g. after a downgrade or a limit change) keeps every
 * page, stays published and stays editable; it just cannot gain pages until it
 * is back under the limit.
 */
export const PAGE_LIMIT_ERROR = 'PAGE_LIMIT_REACHED'

/** Page limit for any `billing_plans.code` (null/unknown resolves to FREE). */
export function pageLimitForPlan(planCode: string | null | undefined): number {
  return PAGE_LIMITS[toPlanCode(planCode)]
}

/** True when going from `current` to `next` pages adds pages past `limit`. */
export function isPageGrowthBlocked(current: number, next: number, limit: number): boolean {
  return next > current && next > limit
}

/** Localized (TR/EN) explanation shown whenever new pages are refused. */
export function pageLimitMessage(lang: string | null | undefined, limit: number, current?: number): string {
  if (lang === 'en') {
    return `Your plan allows up to ${limit} pages${
      current !== undefined ? ` (this site has ${current})` : ''
    }. Your existing pages are kept as they are, but new pages can't be added until you upgrade your plan.`
  }
  return `Paketiniz en fazla ${limit} sayfaya izin veriyor${
    current !== undefined ? ` (bu sitede ${current} sayfa var)` : ''
  }. Mevcut sayfalarınız olduğu gibi korunur ancak paketinizi yükseltmeden yeni sayfa eklenemez.`
}

/** Instruction appended to the AI site-generation prompt. */
export function pageLimitPromptHint(limit: number): string {
  return (
    `The "pages" array MUST contain at most ${limit} entries (the owner's plan limit). ` +
    `Always keep the home page first and drop the least important pages first. `
  )
}

type WithPages<T> = { pages: Array<{ slug: string; title: string; isHome?: boolean }> } & T

/**
 * Trims a FRESHLY GENERATED site to `limit` pages. The home page is always
 * kept (and kept first); the remaining pages keep their relative order.
 * Never use this on an existing site: existing pages must not be removed.
 */
export function capPagesToLimit<T extends { pages: Array<{ slug: string; title: string; isHome?: boolean }> }>(
  site: WithPages<T>,
  limit: number,
): WithPages<T> {
  if (site.pages.length <= limit) return site
  const safeLimit = Math.max(1, limit)
  const home = site.pages.find((p) => p.isHome) ?? site.pages[0]
  const rest = site.pages.filter((p) => p !== home)
  const kept = new Set([home, ...rest.slice(0, safeLimit - 1)])
  return { ...site, pages: site.pages.filter((p) => kept.has(p)) }
}
