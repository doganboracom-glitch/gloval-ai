import { planAllowsCatalog } from '@/lib/commerce-mode'

/**
 * The product catalog is an editor FEATURE of a corporate site, not a site
 * type. Turning it on writes `commerce_mode = 'catalog'` and nothing else:
 * `project_type` never changes (see `lib/site-kind.ts`).
 */

export type CatalogToggleBlocker =
  | 'plan_required'
  | 'is_store'
  | 'has_orders'
  | 'already_enabled'
  | 'already_disabled'

export const CATALOG_PLAN_WARNING =
  'Ürün kataloğu PRO pakete özeldir. Kataloğu açmak için paketinizi PRO\'ya yükseltin.'

export function catalogToggleBlocker(input: {
  enable: boolean
  projectType: string | null | undefined
  commerceMode: string | null | undefined
  planCode: string | null | undefined
  orders: number
}): CatalogToggleBlocker | null {
  const enabled = input.commerceMode === 'catalog'
  if (input.enable) {
    if (enabled) return 'already_enabled'
    if (input.projectType === 'ecommerce' || input.commerceMode === 'ecommerce') return 'is_store'
    if (!planAllowsCatalog(input.planCode)) return 'plan_required'
    if (input.orders > 0) return 'has_orders'
    return null
  }
  return enabled ? null : 'already_disabled'
}

/** The single column the toggle writes. */
export function catalogColumns(enable: boolean): { commerce_mode: 'catalog' | 'none' } {
  return { commerce_mode: enable ? 'catalog' : 'none' }
}
