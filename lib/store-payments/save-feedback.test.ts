import { describe, expect, it } from 'vitest'
import { runSaveWithFeedback, type SaveFeedbackMessages } from './save-feedback'

const messages: SaveFeedbackMessages = {
  saved: 'Ayarlar kaydedildi',
  errors: { card_not_ready: 'Kart modülü açılamadı: iyzico bağlantısı henüz test edilmedi.' },
  fallbackError: 'Ayarlar kaydedilemedi. Lütfen tekrar deneyin.',
}

describe('runSaveWithFeedback', () => {
  it('reports success with the view', async () => {
    const out = await runSaveWithFeedback(async () => ({ ok: true as const, view: { v: 1 } }), messages)
    expect(out.feedback).toEqual({ kind: 'success', message: 'Ayarlar kaydedildi' })
    expect(out.view).toEqual({ v: 1 })
  })

  it('shows the specific message for a known server error', async () => {
    const out = await runSaveWithFeedback(
      async () => ({ ok: false as const, error: 'card_not_ready' }),
      messages,
    )
    expect(out.feedback).toEqual({ kind: 'error', message: messages.errors.card_not_ready })
    expect(out.view).toBeNull()
  })

  it('falls back to a clear error for an unknown error key', async () => {
    const out = await runSaveWithFeedback(
      async () => ({ ok: false as const, error: 'something_new' }),
      messages,
    )
    expect(out.feedback).toEqual({ kind: 'error', message: messages.fallbackError })
  })

  it('turns a thrown exception into an error message', async () => {
    const out = await runSaveWithFeedback<unknown>(async () => {
      throw new Error('network')
    }, messages)
    expect(out.feedback).toEqual({ kind: 'error', message: messages.fallbackError })
    expect(out.view).toBeNull()
  })
})
