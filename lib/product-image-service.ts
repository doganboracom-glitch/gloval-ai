import {
  isUuid,
  productImagePath,
  projectIdFromPath,
  storagePathFromUrl,
} from '@/lib/product-images'
import { processProductImage } from '@/lib/product-image-pipeline'

/** The slice of object storage the gallery needs; swapped for a mock in tests. */
export type ImageStore = {
  /** Public URL prefix that every stored file URL starts with (ends in `/`). */
  storageBase: string | null
  upload(path: string, bytes: Buffer, contentType: string): Promise<{ error?: string }>
  remove(paths: string[]): Promise<{ error?: string }>
  publicUrl(path: string): string
}

export type UploadDeps = {
  /** Resolves when the caller may write to the project, throws otherwise. */
  authorize(projectId: string): Promise<void>
  store: ImageStore
  newId(): string
}

export type UploadResult =
  | { ok: true; url: string; path: string; width: number; height: number }
  | {
      ok: false
      status: 400 | 401 | 403 | 413 | 415 | 500
      error: 'invalid_project' | 'unauthenticated' | 'forbidden' | 'too_large' | 'unsupported_type' | 'corrupt' | 'upload_failed'
    }

/**
 * Authorizes, validates, sanitizes and stores one product photo. Authorization runs
 * before any bytes are inspected, and the destination folder is derived from the
 * authorized `projectId` only — a caller can never address another project's path.
 */
export async function uploadProductImage(
  deps: UploadDeps,
  projectId: string,
  bytes: Buffer,
): Promise<UploadResult> {
  if (!isUuid(projectId)) return { ok: false, status: 400, error: 'invalid_project' }

  try {
    await deps.authorize(projectId)
  } catch (err) {
    const unauthenticated = err instanceof Error && err.message === 'UNAUTHENTICATED'
    return unauthenticated
      ? { ok: false, status: 401, error: 'unauthenticated' }
      : { ok: false, status: 403, error: 'forbidden' }
  }

  const processed = await processProductImage(bytes)
  if (!processed.ok) {
    if (processed.error === 'too_large') return { ok: false, status: 413, error: 'too_large' }
    return { ok: false, status: 415, error: processed.error }
  }

  const path = productImagePath(projectId.toLowerCase(), deps.newId())
  const { error } = await deps.store.upload(path, processed.buffer, processed.contentType)
  if (error) return { ok: false, status: 500, error: 'upload_failed' }

  return {
    ok: true,
    url: deps.store.publicUrl(path),
    path,
    width: processed.width,
    height: processed.height,
  }
}

export type CleanupDeps = {
  store: Pick<ImageStore, 'remove' | 'storageBase'>
  /** Every image URL any product of the project still references. */
  listReferencedUrls(projectId: string): Promise<string[]>
}

/**
 * Deletes this project's uploaded files that no product references any more.
 * Never throws: a storage failure leaves the saved record untouched (it already
 * points at the right images) and only costs an orphaned file, which is logged.
 */
export async function removeUnreferencedProjectImages(
  deps: CleanupDeps,
  projectId: string,
  paths: string[],
): Promise<{ removed: string[] }> {
  const wanted = [...new Set(paths)].filter((p) => projectIdFromPath(p) === projectId.toLowerCase())
  if (wanted.length === 0) return { removed: [] }

  try {
    const referenced = new Set(
      (await deps.listReferencedUrls(projectId))
        .map((url) => storagePathFromUrl(url, deps.store.storageBase))
        .filter((p): p is string => p !== null),
    )
    const toRemove = wanted.filter((p) => !referenced.has(p))
    if (toRemove.length === 0) return { removed: [] }

    const { error } = await deps.store.remove(toRemove)
    if (error) {
      console.error('[product-images] storage remove failed', { projectId, count: toRemove.length, error })
      return { removed: [] }
    }
    return { removed: toRemove }
  } catch (err) {
    console.error('[product-images] cleanup failed', {
      projectId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { removed: [] }
  }
}

/** Same cleanup, addressed by URL (unsaved uploads the owner removed or abandoned). */
export function discardProjectImageUrls(deps: CleanupDeps, projectId: string, urls: string[]) {
  const paths = urls
    .map((url) => storagePathFromUrl(url, deps.store.storageBase))
    .filter((p): p is string => p !== null)
  return removeUnreferencedProjectImages(deps, projectId, paths)
}
