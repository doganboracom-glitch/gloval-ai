/**
 * Pure rules for publishing on the automatic FREE plan. A signed-up account
 * with no subscription row IS on FREE (the billing screen already says so), so
 * publishing never demands "pick a plan first". What FREE may publish is
 * decided here, once, and enforced on the server in `publishProject`.
 */
export const FREE_STOREFRONT_ERROR = 'FREE_PLAN_STOREFRONT'
export const FREE_PAGE_LIMIT_ERROR = 'PAGE_LIMIT_REACHED'
export const FREE_SITE_LIMIT_ERROR = 'SITE_LIMIT_REACHED'

export type FreePublishBlock = 'site_limit' | 'page_limit' | 'storefront'

export type FreePublishVerdict =
  | { ok: true }
  | { ok: false; block: FreePublishBlock; used?: number; total?: number; limit?: number }

/**
 * Limits only block GROWTH: re-publishing a site that is already live never
 * consumes capacity and is never refused here.
 */
export function evaluateFreePublish(input: {
  alreadyLive: boolean
  isStorefront: boolean
  pageCount: number
  pageLimit: number
  otherPublished: number
  siteLimit: number
}): FreePublishVerdict {
  if (input.alreadyLive) return { ok: true }
  if (input.isStorefront) return { ok: false, block: 'storefront' }
  if (input.otherPublished >= input.siteLimit) {
    return { ok: false, block: 'site_limit', used: input.otherPublished, total: input.siteLimit }
  }
  if (input.pageCount > input.pageLimit) {
    return { ok: false, block: 'page_limit', limit: input.pageLimit }
  }
  return { ok: true }
}

/** What the editor should do when the owner presses "Yayınla". */
export type PublishOptions =
  | { mode: 'direct' }
  | { mode: 'free_choice' }
  | { mode: 'packages_only'; block: FreePublishBlock; used?: number; total?: number; limit?: number }

export function publishOptionsFromVerdict(verdict: FreePublishVerdict): PublishOptions {
  if (verdict.ok) return { mode: 'free_choice' }
  return { mode: 'packages_only', block: verdict.block, used: verdict.used, total: verdict.total, limit: verdict.limit }
}
