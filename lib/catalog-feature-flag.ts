import { planAllowsCatalog } from '@/lib/commerce-mode'

/**
 * Gate for the OWNER-SIDE catalog switch only (editor "Ürünler" tab and the
 * `setCatalogEnabled` action). Off unless CATALOG_FEATURE_UI is exactly `true`.
 *
 * It is deliberately NOT read by any public renderer, route or sitemap: sites
 * whose `commerce_mode` is already `catalog` keep serving /urunlerimiz, and
 * everything else keeps answering 404 there, whatever this flag says.
 */
export function isCatalogFeatureUiEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CATALOG_FEATURE_UI === 'true'
}

export type CatalogFeatureTabState = {
  projectId: string
  enabled: boolean
  planAllowed: boolean
}

/** What the editor page hands to the "Ürünler" tab; `null` hides the tab. */
export function resolveCatalogFeatureTab(input: {
  flagEnabled: boolean
  isOwner: boolean
  projectId: string
  projectType: string | null | undefined
  commerceMode: string | null | undefined
  planCode: string | null | undefined
}): CatalogFeatureTabState | null {
  if (!input.flagEnabled) return null
  if (!input.isOwner || !input.commerceMode) return null
  if (input.commerceMode === 'ecommerce' || input.projectType === 'ecommerce') return null
  return {
    projectId: input.projectId,
    enabled: input.commerceMode === 'catalog',
    planAllowed: planAllowsCatalog(input.planCode),
  }
}
