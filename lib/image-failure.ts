/**
 * The two user-facing outcomes of an AI image request, kept apart on purpose:
 *
 *  - NOT ENOUGH CREDITS (HTTP 402): the user must top up or upgrade.
 *  - GENERATION FAILED (HTTP 502, code `image_generation_failed`): the
 *    provider/storage step broke. Nothing was charged and a retry is fine.
 *
 * No Node/Supabase imports: shared by the server routes and the browser UI.
 */

export const IMAGE_FAILED_CODE = 'image_generation_failed'

export const IMAGE_FAILED_USER_MESSAGE =
  'Görsel şu an üretilemedi, kredi düşülmedi, tekrar deneyin.'

export const IMAGE_FAILED_USER_MESSAGE_EN =
  'The image could not be generated right now. No credits were used, please try again.'

export function outOfCreditsMessage(balance: number | null | undefined, lang: 'tr' | 'en' = 'tr'): string {
  const known = typeof balance === 'number' && Number.isFinite(balance)
  if (lang === 'en') {
    return known
      ? `You don't have enough AI credits. Remaining: ${balance}. Upgrade your plan.`
      : `You don't have enough AI credits. Upgrade your plan.`
  }
  return known
    ? `Yeterli AI krediniz yok. Kalan: ${balance}. Paketinizi yükseltin.`
    : 'Yeterli AI krediniz yok. Paketinizi yükseltin.'
}

/**
 * Reduces an error to a short cause that is safe to log: the error class plus
 * a message with e-mail addresses, URLs, UUIDs, bearer/API tokens and long
 * opaque strings removed, so no personal data or secrets reach the logs.
 */
export function sanitizeFailureReason(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const message = raw
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b(?:sk|pk|key|token|bearer)[-_ ]?[\w-]{12,}\b/gi, '[secret]')
    .replace(/\b[\w-]{32,}\b/g, '[opaque]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  return message ? `${name}: ${message}` : name
}

/**
 * Logs the real cause (no personal data) and returns the "failed, not charged"
 * response. Call it only on paths where no credit was spent.
 */
export function imageGenerationFailedResponse(route: string, err: unknown): Response {
  console.error(`[image-failure] route=${route} reason=${sanitizeFailureReason(err)}`)
  return Response.json(
    { error: IMAGE_FAILED_CODE, message: IMAGE_FAILED_USER_MESSAGE, charged: false },
    { status: 502 },
  )
}
