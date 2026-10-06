/**
 * Canonical, deterministic slugifier shared by the store sync (server) and the
 * generated-site catalog matching (client).
 *
 * It MUST stay byte-for-byte compatible with the slug logic in
 * `lib/ecommerce.ts` so that a product's stored `slug` (e.g. what the admin
 * panel created) and the slug derived from a schema product's display name
 * resolve to the same value — that equality is what lets the generated
 * homepage cards find their real database product.
 *
 * Unlike the admin-panel helper it uses a STABLE fallback (`urun`) instead of a
 * timestamp, because both the writer (sync) and the reader (render) must derive
 * the exact same slug for the same name; a time-based fallback would break that
 * match. Real products always have a name, so the fallback is only a guard.
 */
export function slugify(input: string): string {
  return (
    (input || '')
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'urun'
  )
}

/**
 * Canonical slug for a project name. Project domains are intentionally stable
 * after first publish; this helper is only used when a project needs its first
 * slug (and by tooling that previews an unpublished project).
 */
export function slugifyProjectName(input: string): string {
  return slugify(input).replace(/-?urun$/, '') || 'site'
}

/**
 * Parses a human display price ("₺899", "$29", "1.299,00 TL", "1,299.00") into
 * integer cents. Mirrors the client cart parser so the value stored at sync
 * time matches what a buyer sees. Treats the last separator as the decimal
 * point and supports both Turkish (1.299,00) and English (1,299.00) grouping.
 */
export function parsePriceToCents(display: string): number {
  const cleaned = (display || '').replace(/[^\d.,]/g, '')
  if (!cleaned) return 0
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : ''
  let intPart = cleaned
  let fracPart = ''
  if (decimalSep) {
    const idx = cleaned.lastIndexOf(decimalSep)
    const frac = cleaned.slice(idx + 1)
    if (frac.length >= 1 && frac.length <= 2) {
      intPart = cleaned.slice(0, idx)
      fracPart = frac
    }
  }
  const digits = intPart.replace(/[.,]/g, '')
  const cents = parseInt(digits || '0', 10) * 100 + parseInt(fracPart.padEnd(2, '0') || '0', 10)
  return Number.isFinite(cents) ? cents : 0
}

/** Infers an ISO currency from a display price's symbol (defaults to TRY). */
export function inferCurrency(display: string): string {
  if ((display || '').includes('$')) return 'USD'
  if ((display || '').includes('€')) return 'EUR'
  return 'TRY'
}
