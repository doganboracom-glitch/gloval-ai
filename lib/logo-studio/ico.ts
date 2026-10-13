/** Builds a multi-size .ico whose images are PNGs (supported by every current browser). */
export function buildIco(images: { size: number; png: Uint8Array }[]): Uint8Array {
  const headerLen = 6 + images.length * 16
  const total = headerLen + images.reduce((n, i) => n + i.png.byteLength, 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, images.length, true)
  let offset = headerLen
  images.forEach((img, i) => {
    const at = 6 + i * 16
    out[at] = img.size >= 256 ? 0 : img.size
    out[at + 1] = img.size >= 256 ? 0 : img.size
    view.setUint16(at + 4, 1, true)
    view.setUint16(at + 6, 32, true)
    view.setUint32(at + 8, img.png.byteLength, true)
    view.setUint32(at + 12, offset, true)
    out.set(img.png, offset)
    offset += img.png.byteLength
  })
  return out
}
