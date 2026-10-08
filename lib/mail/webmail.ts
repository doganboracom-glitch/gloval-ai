/**
 * Single source of truth for the mail server's host and webmail address.
 *
 * Webmail is served by ONE shared SOGo instance for every customer; it is
 * never derived from a customer's domain (`webmail.<domain>` has no DNS record).
 * Change the address here or via env, nowhere else.
 */

export const DEFAULT_MAIL_SERVER_HOST = 'mailserver.gloval.ai'

const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i

/** Host MX records point at. Unchanged semantics: env value, else the default. */
export function getMailServerHost(): string {
  return process.env.MAIL_SERVER_HOST?.trim() || DEFAULT_MAIL_SERVER_HOST
}

/**
 * Where customers open webmail:
 *  1. `MAIL_WEBMAIL_URL` when it is a valid http(s) URL
 *  2. `https://${MAIL_SERVER_HOST}/SOGo/` when the host is well-formed
 *  3. `https://mailserver.gloval.ai/SOGo/`
 */
export function getWebmailUrl(): string {
  const explicit = process.env.MAIL_WEBMAIL_URL?.trim()
  if (explicit) {
    try {
      const url = new URL(explicit)
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString()
    } catch {
      // Malformed override: fall through to the host-based default.
    }
  }

  const host = process.env.MAIL_SERVER_HOST?.trim()
  if (host && HOST_RE.test(host)) return `https://${host}/SOGo/`
  return `https://${DEFAULT_MAIL_SERVER_HOST}/SOGo/`
}
