import { describe, expect, it } from 'vitest'
import {
  CONTACT_PREFILL_MAX_LENGTH,
  sanitizeContactPrefillMessage,
} from './contact-prefill'

describe('sanitizeContactPrefillMessage', () => {
  it('removes markup and control characters while keeping the content as plain text', () => {
    const message = sanitizeContactPrefillMessage('Call <script>alert(1)</script>\u0000now')

    expect(message).toBe('Call alert(1) now')
    expect(message).not.toMatch(/[<>\u0000-\u001f\u007f-\u009f]/)
  })

  it('limits the sanitized message to 500 Unicode characters', () => {
    const message = sanitizeContactPrefillMessage('ı'.repeat(CONTACT_PREFILL_MAX_LENGTH + 20))

    expect(Array.from(message)).toHaveLength(CONTACT_PREFILL_MAX_LENGTH)
  })

  it('preserves the trailing space in the phone-number prompt and rejects non-string values', () => {
    const phonePrompt = 'Web sitesi yaptırmak istiyorum. Telefonum: '

    expect(sanitizeContactPrefillMessage(phonePrompt)).toBe(phonePrompt)
    expect(sanitizeContactPrefillMessage(['not a string'])).toBe('')
  })
})
