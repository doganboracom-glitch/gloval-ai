/**
 * Storefront pages (home showcase, store list, product page, checkout) read the
 * catalog from the database. Custom domains and `*.gloval.site` are rewritten to
 * `/site/<slug>`, so refreshing that path tree covers every host.
 */

export type StorefrontRevalidateDeps = {
  /** Resolves the public slug from whatever id the caller has (project or order). */
  findSlug: (id: string) => Promise<string | null>
  revalidatePath: (path: string, type?: 'layout' | 'page') => void
}

/** One `layout` entry refreshes the home page and every route below it (store, product, cart, checkout). */
export function storefrontPaths(slug: string): Array<{ path: string; type: 'layout' | 'page' }> {
  return [{ path: `/site/${slug}`, type: 'layout' }]
}

/** Never throws: a failed refresh must not turn a successful product save into an error. */
export async function revalidateStorefront(
  deps: StorefrontRevalidateDeps,
  id: string,
): Promise<void> {
  try {
    const slug = await deps.findSlug(id)
    if (!slug) return
    for (const { path, type } of storefrontPaths(slug)) deps.revalidatePath(path, type)
  } catch {
    // The pages are rendered dynamically, so a missed refresh only delays caches.
  }
}
