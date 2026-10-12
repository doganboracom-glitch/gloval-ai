export const GALLERY_MAX_IMAGES = 8

export type GalleryView = {
  count: number
  /** Thumbnail strip and arrow buttons exist only with 2+ images. */
  showStrip: boolean
  showArrows: boolean
  /** "2 / 3" style counter, null with a single image. */
  counter: string | null
}

export function galleryView(imageCount: number, active: number): GalleryView {
  const count = Math.max(0, Math.min(imageCount, GALLERY_MAX_IMAGES))
  const multi = count > 1
  const index = Math.min(Math.max(active, 0), Math.max(count - 1, 0))
  return {
    count,
    showStrip: multi,
    showArrows: multi,
    counter: multi ? `${index + 1} / ${count}` : null,
  }
}

/** Wrap-around step used by arrows, swipe and lightbox keys. */
export function stepGalleryIndex(active: number, delta: number, count: number): number {
  if (count < 2) return active
  return (active + delta + count) % count
}
