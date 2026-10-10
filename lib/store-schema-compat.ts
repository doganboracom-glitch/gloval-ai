type DbError = { code?: string | null; message?: string | null } | null | undefined

/**
 * The order-integrity migration (scripts/032) is applied separately from the
 * deploy. These detectors let the code fall back to the legacy behavior while a
 * column or function does not exist yet, instead of failing the request.
 */
export function isMissingColumnError(error: DbError): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? '')
}

export function isMissingFunctionError(error: DbError): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202') return true
  return /could not find the function|function .* does not exist/i.test(error.message ?? '')
}
