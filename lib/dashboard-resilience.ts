/**
 * The dashboard's projects query is the one critical read; everything else on
 * the page (unread counters, Aura rights, billing) is decoration that must not
 * be able to take the whole panel down.
 */

/** Runs a non-critical read; any failure yields `fallback` instead of throwing. */
export async function nonCritical<T>(
  label: string,
  read: () => PromiseLike<T> | T,
  fallback: T,
): Promise<T> {
  try {
    return await read()
  } catch (error) {
    console.error(`[dashboard] ${label} failed, using fallback`, error)
    return fallback
  }
}

/**
 * Runs a critical read and retries it exactly once after a short pause, so a
 * transient network/database blip does not surface as an error page. A second
 * failure is rethrown unchanged for the error boundary.
 */
export async function withOneRetry<T>(
  label: string,
  read: () => PromiseLike<T> | T,
  delayMs = 250,
): Promise<T> {
  try {
    return await read()
  } catch (firstError) {
    console.error(`[dashboard] ${label} failed, retrying once`, firstError)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return await read()
  }
}
