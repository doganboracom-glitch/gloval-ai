/**
 * Recognises an anti-bot / WAF verification page. This is only used to tell the
 * visitor the truth ("the site's firewall asks for a human check"). The scanner
 * never tries to solve or bypass such a page.
 */

/** Challenge pages are small; a real page that merely mentions a vendor is not one. */
const MAX_CHALLENGE_BYTES = 65_536
const SIGNATURE_WINDOW_CHARS = 40_000

const SIGNATURES: RegExp[] = [
  // Cloudflare
  /<title>\s*just a moment\.{0,3}\s*<\/title>/i,
  /<title>\s*attention required!?\s*\|\s*cloudflare/i,
  /cf-browser-verification/i,
  /\/cdn-cgi\/challenge-platform\//i,
  /cf-chl-(?:bypass|opt|widget)/i,
  /checking your browser before accessing/i,
  /enable javascript and cookies to continue/i,
  // Imperva / Incapsula
  /_incapsula_resource/i,
  /incapsula incident id/i,
  // Sucuri
  /sucuri website firewall/i,
  // Akamai
  /reference&#32;&#35;\d+\.[0-9a-f]+/i,
  /errors\.edgesuite\.net/i,
  // DataDome / PerimeterX / generic captcha walls
  /captcha-delivery\.com/i,
  /px-captcha/i,
  /pardon our interruption/i,
  /verify you are (?:a )?human/i,
]

const CHALLENGE_STATUSES = new Set([202, 401, 403, 429, 503])

export type WafInput = {
  status: number
  /** Value of the `cf-mitigated` response header, when present. */
  cfMitigated?: string | null
  /** Start of the body, decoded as text. */
  body: string
  bodyBytes: number
}

export function detectWafChallenge({ status, cfMitigated, body, bodyBytes }: WafInput): boolean {
  if (cfMitigated && /challenge/i.test(cfMitigated)) return true
  if (bodyBytes > MAX_CHALLENGE_BYTES) return false
  const looksLikeBlock = CHALLENGE_STATUSES.has(status) || (status >= 200 && status < 300)
  if (!looksLikeBlock) return false
  const window = body.slice(0, SIGNATURE_WINDOW_CHARS)
  return SIGNATURES.some((signature) => signature.test(window))
}
