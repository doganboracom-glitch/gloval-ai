/**
 * Storefront pages (home showcase, store list, product page) read the catalog
 * from the database. Custom domains and `*.gloval.site` are rewritten to
 * `/site/<slug>`, so refreshing that path tree covers every host.
 */

export type StorefrontRevalidateDeps = {
  findSlug: (projectId: string) => Promise<string | null>
  revalidatePath: (path: string, type?: 'layout' | 'page') => void
}

export function storefrontPaths(slug: string): Array<{ path: string; type: 'layout' | 'page' }> {
  const base = `/site/${slug}`
  return [
    { path: base, type: 'page' },
    { path: `${base}/store`, type: 'layout' },
  ]
}

/** Never throws: a failed refresh must not turn a successful product save into an error. */
export async function revalidateStorefront(
  deps: StorefrontRevalidateDeps,
  projectId: string,
): Promise<void> {
  try {
    const slug = await deps.findSlug(projectId)
    if (!slug) return
    for (const { path, type } of storefrontPaths(slug)) deps.revalidatePath(path, type)
  } catch {
    // The pages are rendered dynamically, so a missed refresh only delays caches.
  }
}
