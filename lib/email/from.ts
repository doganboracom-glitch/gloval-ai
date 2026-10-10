/**
 * Builds the `From` header for store emails: "<Store name> via GLOVAL AI
 * <address>". The address always comes from `MAIL_FROM` (the verified sender);
 * only the display name changes. Pure so it can be tested.
 */

const BRAND = 'GLOVAL AI'

function extractAddress(mailFrom: string): string | null {
  const angle = mailFrom.match(/<([^<>]+)>/)
  const candidate = (angle ? angle[1] : mailFrom).trim()
  return /^[^\s<>@,;"]+@[^\s<>@,;"]+$/.test(candidate) ? candidate : null
}

/** Strips characters that could break out of the header or the display name. */
function cleanDisplayName(name: string): string {
  return name
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>",;:\\()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

export function composeStoreFrom(mailFrom: string, storeName: string | null | undefined): string {
  const address = extractAddress(mailFrom)
  if (!address) return mailFrom
  const store = cleanDisplayName(storeName ?? '')
  const display = store ? `${store} via ${BRAND}` : BRAND
  return `"${display}" <${address}>`
}

/** Only a single, well-formed address is accepted as a reply-to. */
export function sanitizeReplyTo(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim()
  return /^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/.test(trimmed) ? trimmed : undefined
}
