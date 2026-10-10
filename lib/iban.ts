/**
 * Turkish IBAN validation. Pure and dependency-free so it can run on the
 * server (authoritative) and in tests. A TR IBAN is "TR" + 2 check digits +
 * 22 digits (26 characters) and must satisfy the ISO 13616 mod-97 check.
 */

/** Uppercases and strips spaces/dashes. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase()
}

/** Groups an IBAN in blocks of four for display ("TR12 3456 ..."). */
export function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim()
}

function mod97(numeric: string): number {
  let remainder = 0
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder
}

export function isValidTurkishIban(raw: string): boolean {
  const iban = normalizeIban(raw)
  if (!/^TR\d{24}$/.test(iban)) return false
  // Move the first four characters to the end and map letters to 10..35.
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))
  return mod97(numeric) === 1
}
