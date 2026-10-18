/**
 * Publish times are stamped by the server, so "is this post live yet?" must be
 * answered with the server's clock. A browser whose clock runs ahead or behind
 * would otherwise show a just-published post as "Planlı" (scheduled) and hide
 * the blog link in the preview until its own clock caught up.
 */

/** Server time minus client time, in ms (positive when the server is ahead). */
export function clockOffsetMs(serverNowIso: string | undefined | null, clientNowMs: number): number {
  if (!serverNowIso) return 0
  const server = Date.parse(serverNowIso)
  return Number.isFinite(server) ? server - clientNowMs : 0
}

let offsetMs = 0

/** Remember the server clock from the latest blog list response. */
export function noteServerTime(serverNowIso: string | undefined | null, clientNowMs: number = Date.now()): void {
  offsetMs = clockOffsetMs(serverNowIso, clientNowMs)
}

/** The current time as the server sees it (falls back to the browser clock before the first response). */
export function blogNow(clientNowMs: number = Date.now()): Date {
  return new Date(clientNowMs + offsetMs)
}

export function resetBlogClock(): void {
  offsetMs = 0
}
