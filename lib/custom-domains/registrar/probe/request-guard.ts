/**
 * Browser-facing checks for the state-changing probe endpoint. The session cookie
 * alone is not enough: a cross-site form post would carry it, so a POST must come
 * from this site and must be a JSON request (which a plain HTML form can not send).
 */

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
  return originHost === host
}

export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get('content-type') ?? ''
  return type.split(';')[0]?.trim().toLowerCase() === 'application/json'
}
