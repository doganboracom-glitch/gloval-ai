export const CONTACT_PREFILL_MAX_LENGTH = 500

const MAX_RAW_CONTACT_PREFILL_LENGTH = 2_000

export function sanitizeContactPrefillMessage(value: unknown): string {
  if (typeof value !== 'string') return ''

  const plainText = value
    .slice(0, MAX_RAW_CONTACT_PREFILL_LENGTH)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')

  return Array.from(plainText).slice(0, CONTACT_PREFILL_MAX_LENGTH).join('')
}
