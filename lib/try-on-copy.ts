export type TryOnGenericKey = 'unavailable' | 'failed' | 'rate_limited' | 'not_available' | 'default'

export type TryOnCopy = {
  cta: string
  title: string
  intro: string
  uploadHint: string
  changePhoto: string
  generate: string
  generating: string
  tryAgain: string
  download: string
  close: string
  errorTooLarge: string
  errorType: string
  errorGeneric: Record<TryOnGenericKey, string>
}

export const TRY_ON_COPY: Record<'tr' | 'en', TryOnCopy> = {
  tr: {
    cta: 'AI ile üzerinde dene',
    title: 'Üzerinde dene',
    intro: 'Bir fotoğrafını yükle, yapay zekâ ürünü senin üzerinde göstersin.',
    uploadHint: 'Fotoğraf yükle (JPG, PNG veya WEBP, en fazla 12MB)',
    changePhoto: 'Fotoğrafı değiştir',
    generate: 'Oluştur',
    generating: 'Oluşturuluyor…',
    tryAgain: 'Tekrar dene',
    download: 'İndir',
    close: 'Kapat',
    errorTooLarge: 'Fotoğraf çok büyük. Lütfen 12MB altında bir görsel seç.',
    errorType: 'Sadece JPG, PNG veya WEBP formatında fotoğraf yükleyebilirsin.',
    errorGeneric: {
      unavailable: 'Bu özellik şu anda kullanılamıyor.',
      failed: 'Görsel oluşturulamadı. Lütfen tekrar dene.',
      rate_limited: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar dene.',
      not_available: 'Bu özellik şu anda kullanılamıyor.',
      default: 'Bir şeyler ters gitti. Lütfen tekrar dene.',
    },
  },
  en: {
    cta: 'Try it on with AI',
    title: 'Try it on',
    intro: 'Upload a photo of yourself and let AI show you wearing the product.',
    uploadHint: 'Upload a photo (JPG, PNG or WEBP, up to 12MB)',
    changePhoto: 'Change photo',
    generate: 'Generate',
    generating: 'Generating…',
    tryAgain: 'Try again',
    download: 'Download',
    close: 'Close',
    errorTooLarge: 'That photo is too large. Please choose one under 12MB.',
    errorType: 'Please upload a JPG, PNG or WEBP photo.',
    errorGeneric: {
      unavailable: 'This feature is not available right now.',
      failed: 'Could not generate the image. Please try again.',
      rate_limited: 'Too many attempts. Please try again in a few minutes.',
      not_available: 'This feature is not available right now.',
      default: 'Something went wrong. Please try again.',
    },
  },
}

/**
 * Maps an `/api/try-on` failure to the message shown to the buyer.
 * `status` 413 comes from the platform (non-JSON body), so `error` is
 * undefined there; unknown or missing codes fall back to the default copy.
 */
export function tryOnErrorMessage(copy: TryOnCopy, status: number, error?: string): string {
  if (status === 413) return copy.errorTooLarge
  if (error === 'invalid_photo') return copy.errorType
  if (error && Object.prototype.hasOwnProperty.call(copy.errorGeneric, error)) {
    return copy.errorGeneric[error as TryOnGenericKey]
  }
  return copy.errorGeneric.default
}
