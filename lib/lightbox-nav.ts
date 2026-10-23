/** Pure helpers behind the site lightbox, kept apart from the component so they test without a DOM. */

export type LightboxLang = 'tr' | 'en'

export type LightboxItem =
  | { kind: 'image'; src: string; alt: string; caption?: string }
  | { kind: 'video'; embedUrl: string; title: string }

/** Wraps around: the item after the last is the first, the one before the first is the last. */
export function stepIndex(index: number, count: number, direction: -1 | 1): number {
  if (count <= 0) return 0
  return (((index + direction) % count) + count) % count
}

/** "2/3" (1-based). */
export function lightboxCounter(index: number, count: number): string {
  return `${Math.min(Math.max(index, 0), Math.max(count - 1, 0)) + 1}/${count}`
}

const SWIPE_MIN_DISTANCE = 48

/** A horizontal swipe long enough and flatter than 1:1 moves the lightbox; anything else is ignored. */
export function swipeDirection(dx: number, dy: number): -1 | 1 | null {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) <= Math.abs(dy)) return null
  return dx < 0 ? 1 : -1
}

/** The iframe address for a video once the visitor opened it; autoplay only ever applies after a click. */
export function autoplayEmbedUrl(embedUrl: string): string {
  return `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`
}

const LABELS: Record<
  LightboxLang,
  { dialog: string; close: string; prev: string; next: string; fullscreen: string; exitFullscreen: string }
> = {
  tr: {
    dialog: 'Görsel görüntüleyici',
    close: 'Kapat',
    prev: 'Önceki',
    next: 'Sonraki',
    fullscreen: 'Tam ekran',
    exitFullscreen: 'Tam ekrandan çık',
  },
  en: {
    dialog: 'Media viewer',
    close: 'Close',
    prev: 'Previous',
    next: 'Next',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
  },
}

export function lightboxLabels(lang: LightboxLang) {
  return LABELS[lang]
}
