const SENSITIVE_KEY = /tckn|vkn|national|tax_?(number|no|office)|identity|address|snapshot|phone|e-?mail|full_?name|company|content|body|pdf|bytes_base64/i
const ID_LIKE_VALUE = /(?<!\d)\d{10,11}(?!\d)/
const MAX_STRING = 200
const MAX_DEPTH = 3

function redactValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return ID_LIKE_VALUE.test(value) ? '[redacted]' : value.slice(0, MAX_STRING)
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactValue(item, depth + 1))
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : redactValue(inner, depth + 1),
      ]),
    )
  }
  return undefined
}

/** Strips anything that looks like personal or tax data before it reaches `invoice_audit.detail`. */
export function redactAuditDetail(detail: Record<string, unknown>): Record<string, unknown> {
  return redactValue(detail, 0) as Record<string, unknown>
}
