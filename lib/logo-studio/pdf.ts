/**
 * Tiny single-page PDF writer: one transparent logo image centred on a page
 * sized to the logo. No dependency; compression is injected so the module is
 * environment-agnostic (the browser passes CompressionStream, tests pass zlib).
 */

export type PdfInput = {
  /** Pixel size of the image. */
  width: number
  height: number
  /** width*height*3 bytes, non-premultiplied RGB. */
  rgb: Uint8Array
  /** width*height bytes of alpha. */
  alpha: Uint8Array
  /** Page size in PDF points (1/72in). */
  pageWidth: number
  pageHeight: number
  deflate: (data: Uint8Array) => Promise<Uint8Array>
}

const enc = new TextEncoder()

export async function buildPdf(input: PdfInput): Promise<Uint8Array> {
  const { width, height, pageWidth, pageHeight } = input
  const [rgbZ, alphaZ] = await Promise.all([input.deflate(input.rgb), input.deflate(input.alpha)])

  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data
    chunks.push(bytes)
    length += bytes.byteLength
  }
  const object = (id: number, dict: string, stream?: Uint8Array) => {
    offsets[id] = length
    if (stream) {
      push(`${id} 0 obj\n<< ${dict} /Length ${stream.byteLength} >>\nstream\n`)
      push(stream)
      push('\nendstream\nendobj\n')
    } else {
      push(`${id} 0 obj\n<< ${dict} >>\nendobj\n`)
    }
  }

  const pw = Math.round(pageWidth * 100) / 100
  const ph = Math.round(pageHeight * 100) / 100
  const content = enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Logo Do Q`)

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  object(1, '/Type /Catalog /Pages 2 0 R')
  object(2, '/Type /Pages /Kids [3 0 R] /Count 1')
  object(
    3,
    `/Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Logo 5 0 R >> >> /Contents 4 0 R`,
  )
  object(4, '', content)
  object(
    5,
    `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask 6 0 R`,
    rgbZ,
  )
  object(
    6,
    `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
    alphaZ,
  )

  const xrefAt = length
  let xref = `xref\n0 7\n0000000000 65535 f \n`
  for (let id = 1; id <= 6; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  push(xref)
  push(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.byteLength
  }
  return out
}
