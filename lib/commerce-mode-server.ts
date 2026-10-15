import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanCodeForUser } from '@/lib/billing'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import {
  CATALOG_NOT_AVAILABLE,
  COMMERCE_NOT_AVAILABLE,
  getCommerceMode,
  planAllowsCatalog,
  type CommerceMode,
} from '@/lib/commerce-mode'

export type ProjectCommerce = {
  id: string
  ownerId: string
  slug: string | null
  published: boolean
  /** Effective mode: a catalog site on a non-PRO owner reads as `none`. */
  mode: CommerceMode
  /** Mode as stored, before the plan rule. */
  storedMode: CommerceMode
  ownerPlanCode: string | null
}

type Key = { id: string } | { slug: string }

/**
 * Loads a project's commerce mode through the service role, resolving the OWNER's
 * plan for catalog sites. Tolerates migration 062 not being applied (falls back
 * to project_type). Returns null when the project does not exist.
 */
export async function loadProjectCommerce(key: Key): Promise<ProjectCommerce | null> {
  const admin = createAdminClient()
  const run = async (columns: string) => {
    const query = admin.from('projects').select(columns)
    return 'id' in key ? query.eq('id', key.id).maybeSingle() : query.eq('slug', key.slug).maybeSingle()
  }
  let { data, error } = await run('id, owner_id, slug, published, project_type, commerce_mode')
  if (isMissingColumnError(error)) {
    ;({ data, error } = await run('id, owner_id, slug, published, project_type'))
  }
  if (error) throw error
  if (!data) return null
  const row = data as unknown as {
    id: string
    owner_id: string
    slug: string | null
    published: boolean
    project_type: string | null
    commerce_mode?: string | null
  }
  const storedMode = getCommerceMode(row)
  const ownerPlanCode = storedMode === 'catalog' ? await getPlanCodeForUser(row.owner_id) : null
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    published: Boolean(row.published),
    mode: storedMode === 'catalog' ? getCommerceMode(row, ownerPlanCode) : storedMode,
    storedMode,
    ownerPlanCode,
  }
}

/** Throws COMMERCE_NOT_AVAILABLE unless the project is a full e-commerce store. */
export async function assertEcommerceProject(projectId: string): Promise<ProjectCommerce> {
  const commerce = await loadProjectCommerce({ id: projectId })
  if (!commerce || commerce.mode !== 'ecommerce') throw new Error(COMMERCE_NOT_AVAILABLE)
  return commerce
}

/** Same, for a published store addressed by its public slug (cart/checkout/customer paths). */
export async function assertEcommerceSlug(slug: string): Promise<ProjectCommerce> {
  const commerce = await loadProjectCommerce({ slug })
  if (!commerce || commerce.mode !== 'ecommerce') throw new Error(COMMERCE_NOT_AVAILABLE)
  return commerce
}

/** Non-throwing variant for actions that return a result object. */
export async function isEcommerceSlug(slug: string): Promise<boolean> {
  try {
    const commerce = await loadProjectCommerce({ slug })
    return commerce?.mode === 'ecommerce'
  } catch {
    return false
  }
}

/**
 * Effective mode of a PUBLISHED site addressed by its public slug. Unpublished
 * or unknown sites and read errors all read as `none` (fail closed).
 */
export async function getPublishedSiteCommerceMode(slug: string): Promise<CommerceMode> {
  try {
    const commerce = await loadProjectCommerce({ slug })
    return commerce?.published ? commerce.mode : 'none'
  } catch {
    return 'none'
  }
}

export async function isEcommerceProjectId(projectId: string): Promise<boolean> {
  try {
    const commerce = await loadProjectCommerce({ id: projectId })
    return commerce?.mode === 'ecommerce'
  } catch {
    return false
  }
}

/**
 * Catalog capability gate for owner-side product writes: a catalog project whose
 * owner is not on PRO (Starter/Free) may not write products.
 */
export function assertCatalogPlan(commerce: Pick<ProjectCommerce, 'storedMode' | 'ownerPlanCode'>): void {
  if (commerce.storedMode === 'catalog' && !planAllowsCatalog(commerce.ownerPlanCode)) {
    throw new Error(CATALOG_NOT_AVAILABLE)
  }
}

export type CatalogContext = {
  mode: CommerceMode
  /** Real, non-placeholder WhatsApp digits, or null (button hidden). */
  whatsappNumber: string | null
  /** Canonical site origin used to build shareable product links. */
  origin: string
}

/** Everything the storefront needs to render catalog-mode order buttons. */
export async function getCatalogContext(
  slug: string,
  schema: import('@/lib/website-schema').WebsiteSchema,
  mode: CommerceMode,
): Promise<CatalogContext> {
  const { getSiteSeoContext } = await import('@/lib/seo/site-seo')
  const { resolveContactActions } = await import('@/lib/site-contact-actions')
  const { usableWhatsappNumber } = await import('@/lib/commerce-mode')
  const { origin } = await getSiteSeoContext(slug)
  const resolved = resolveContactActions(schema)
  return { mode, whatsappNumber: usableWhatsappNumber(resolved?.whatsapp?.display), origin }
}
