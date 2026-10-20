import { describe, expect, it } from 'vitest'
import {
  BLOG_UPLOAD_MAX_BYTES,
  inspectUpload,
  isBlogImagePath,
  randomBlogImagePath,
  sniffImage,
  validateUploadDeclaration,
} from '@/lib/blog-upload'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]

const bytes = (head: number[], total = 64) => {
  const out = new Uint8Array(total)
  out.set(head)
  return out
}
const text = (value: string) => new TextEncoder().encode(value)

describe('sniffImage (content based)', () => {
  it('recognises PNG, JPEG and WebP by magic bytes', () => {
    expect(sniffImage(bytes(PNG))).toEqual({ mime: 'image/png', ext: 'png' })
    expect(sniffImage(bytes(JPEG))).toEqual({ mime: 'image/jpeg', ext: 'jpg' })
    expect(sniffImage(bytes(WEBP))).toEqual({ mime: 'image/webp', ext: 'webp' })
  })

  it('rejects a RIFF container that is not WebP', () => {
    expect(sniffImage(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull()
  })
})

describe('inspectUpload', () => {
  it('accepts real images and takes the extension from the bytes', () => {
    expect(inspectUpload(bytes(PNG))).toEqual({ ok: true, kind: { mime: 'image/png', ext: 'png' } })
  })

  it('rejects a file with a spoofed image MIME type but HTML/script content', () => {
    // The browser may call this "image/png"; only the bytes matter.
    const fake = text('<html><script>alert(1)</script></html>')
    expect(inspectUpload(fake)).toEqual({ ok: false, error: 'unsupported_type' })
  })

  it('rejects SVG, including SVG that starts like an image tag', () => {
    expect(inspectUpload(text('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'))).toEqual({
      ok: false,
      error: 'unsupported_type',
    })
    expect(inspectUpload(text('<?xml version="1.0"?><svg onload="x()"/>'))).toEqual({ ok: false, error: 'unsupported_type' })
  })

  it('rejects anything over 5 MB even when it is a valid image header', () => {
    expect(inspectUpload(bytes(PNG, BLOG_UPLOAD_MAX_BYTES + 1))).toEqual({ ok: false, error: 'too_large' })
    expect(inspectUpload(bytes(PNG, BLOG_UPLOAD_MAX_BYTES)).ok).toBe(true)
  })

  it('rejects an empty file', () => {
    expect(inspectUpload(new Uint8Array())).toEqual({ ok: false, error: 'invalid_input' })
  })
})

describe('validateUploadDeclaration', () => {
  it('refuses SVG and other non-allowlisted MIME types before any bytes move', () => {
    expect(validateUploadDeclaration({ size: 100, mime: 'image/svg+xml' })).toEqual({ ok: false, error: 'unsupported_type' })
    expect(validateUploadDeclaration({ size: 100, mime: 'text/html' })).toEqual({ ok: false, error: 'unsupported_type' })
  })

  it('refuses declared sizes over 5 MB and invalid sizes', () => {
    expect(validateUploadDeclaration({ size: BLOG_UPLOAD_MAX_BYTES + 1, mime: 'image/png' })).toEqual({ ok: false, error: 'too_large' })
    expect(validateUploadDeclaration({ size: 0, mime: 'image/png' })).toEqual({ ok: false, error: 'invalid_input' })
    expect(validateUploadDeclaration({ size: '5', mime: 'image/png' })).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('accepts an allowlisted type within the limit', () => {
    expect(validateUploadDeclaration({ size: 1024, mime: 'IMAGE/JPEG' })).toEqual({
      ok: true,
      kind: { mime: 'image/jpeg', ext: 'jpg' },
    })
  })
})

describe('storage paths', () => {
  it('generates random, allowlisted paths and never trusts client file names', () => {
    const path = randomBlogImagePath('png')
    expect(isBlogImagePath(path)).toBe(true)
    expect(path).not.toBe(randomBlogImagePath('png'))
  })

  it('refuses paths outside the blog prefix or with traversal', () => {
    expect(isBlogImagePath('blog/../secrets.png')).toBe(false)
    expect(isBlogImagePath('other/00000000-0000-0000-0000-000000000000.png')).toBe(false)
    expect(isBlogImagePath('blog/00000000-0000-0000-0000-000000000000.svg')).toBe(false)
  })
})
