export const HOVER_GALLERY_INTERVAL_MS = 1200

export type HoverGalleryEnv = {
  imageCount: number
  /** `(hover: hover) and (pointer: fine)` — false on touch devices. */
  hoverCapable: boolean
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean
}

/** The card only cycles images on desktop, with motion allowed, and with 2+ images. */
export function canPlayHoverGallery(env: HoverGalleryEnv): boolean {
  return env.imageCount > 1 && env.hoverCapable && !env.reducedMotion
}

export function nextGalleryIndex(current: number, imageCount: number): number {
  if (imageCount <= 1) return 0
  return (current + 1) % imageCount
}
