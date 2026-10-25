import { IMAGE_FAILED_CODE, IMAGE_FAILED_USER_MESSAGE } from '@/lib/image-failure'

/**
 * Client-safe half of the image-storage failure contract (no Node/Supabase
 * imports), shared by the server routes and the browser UI.
 */

/** Short, user-facing (Turkish) text; the technical cause only goes to the server log. */
export const IMAGE_STORAGE_USER_MESSAGE =
  'Görsel kaydedilemedi. Lütfen birkaç dakika sonra tekrar deneyin; krediniz düşülmedi.'

/** Stable code the routes return so clients can tell this failure apart. */
export const IMAGE_STORAGE_ERROR_CODE = 'image_storage_failed'

/**
 * Returns the user-facing message when `res` is the image-storage failure
 * response, otherwise null. Reads a clone, so the caller can still use `res`.
 */
export async function readImageStorageFailure(res: Response): Promise<string | null> {
  if (res.status !== 502) return null
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { error?: string; message?: string } | null
  if (body?.error === IMAGE_FAILED_CODE) {
    return typeof body.message === 'string' && body.message ? body.message : IMAGE_FAILED_USER_MESSAGE
  }
  if (body?.error !== IMAGE_STORAGE_ERROR_CODE) return null
  return typeof body.message === 'string' && body.message ? body.message : IMAGE_STORAGE_USER_MESSAGE
}
