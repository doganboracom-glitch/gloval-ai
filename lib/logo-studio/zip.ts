/** Minimal store-only ZIP writer (PNG/PDF are already compressed), no dependency. */

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ZipFile = { name: string; data: Uint8Array }

const DOS_DATE = ((2025 - 1980) << 9) | (1 << 5) | 1

export function buildZip(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder()
  const entries = files.map((file) => ({
    name: enc.encode(file.name),
    data: file.data,
    crc: crc32(file.data),
  }))
  const localSize = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0)
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const v = new DataView(out.buffer)
  let p = 0
  const offsets: number[] = []

  for (const e of entries) {
    offsets.push(p)
    v.setUint32(p, 0x04034b50, true)
    v.setUint16(p + 4, 20, true)
    v.setUint16(p + 6, 0x0800, true)
    v.setUint16(p + 8, 0, true)
    v.setUint16(p + 10, 0, true)
    v.setUint16(p + 12, DOS_DATE, true)
    v.setUint32(p + 14, e.crc, true)
    v.setUint32(p + 18, e.data.length, true)
    v.setUint32(p + 22, e.data.length, true)
    v.setUint16(p + 26, e.name.length, true)
    v.setUint16(p + 28, 0, true)
    out.set(e.name, p + 30)
    out.set(e.data, p + 30 + e.name.length)
    p += 30 + e.name.length + e.data.length
  }

  const centralStart = p
  entries.forEach((e, i) => {
    v.setUint32(p, 0x02014b50, true)
    v.setUint16(p + 4, 20, true)
    v.setUint16(p + 6, 20, true)
    v.setUint16(p + 8, 0x0800, true)
    v.setUint16(p + 10, 0, true)
    v.setUint16(p + 12, 0, true)
    v.setUint16(p + 14, DOS_DATE, true)
    v.setUint32(p + 16, e.crc, true)
    v.setUint32(p + 20, e.data.length, true)
    v.setUint32(p + 24, e.data.length, true)
    v.setUint16(p + 28, e.name.length, true)
    v.setUint32(p + 42, offsets[i], true)
    out.set(e.name, p + 46)
    p += 46 + e.name.length
  })

  v.setUint32(p, 0x06054b50, true)
  v.setUint16(p + 8, entries.length, true)
  v.setUint16(p + 10, entries.length, true)
  v.setUint32(p + 12, centralSize, true)
  v.setUint32(p + 16, centralStart, true)
  return out
}
