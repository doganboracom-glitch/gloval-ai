/**
 * The only failure vocabulary a visitor ever sees. The server sends a code and a
 * few typed extras; the client turns the code into a translated message. Every
 * transport, SSRF, robots and noindex failure is the same `unreachable`, so the
 * response cannot be used to map a private network.
 */

export const ADS_SCAN_ERROR_STATUS = {
  invalid_request: 400,
  session_required: 428,
  rate_limited: 429,
  login_required: 401,
  anon_capacity: 429,
  credits_required: 402,
  duplicate: 409,
  unreachable: 422,
  insufficient_content: 422,
  policy_blocked: 422,
  generation_failed: 502,
  timeout: 504,
  service_unavailable: 503,
} as const

export type AdsScanErrorCode = keyof typeof ADS_SCAN_ERROR_STATUS

export type AdsScanError = {
  code: AdsScanErrorCode
  /** `credits_required`: current balance. */
  balance?: number
  /** `policy_blocked`: true when the check ran after the model and the attempt was used up. */
  consumed?: boolean
  /** `rate_limited`: seconds until a retry makes sense. */
  retryAfterSeconds?: number
}

export function adsScanErrorBody(error: AdsScanError): { error: AdsScanError } {
  const body: AdsScanError = { code: error.code }
  if (error.balance !== undefined) body.balance = error.balance
  if (error.consumed !== undefined) body.consumed = error.consumed
  if (error.retryAfterSeconds !== undefined) body.retryAfterSeconds = error.retryAfterSeconds
  return { error: body }
}
