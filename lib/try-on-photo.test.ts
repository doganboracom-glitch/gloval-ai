import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PhotoTooLargeError,
  TRY_ON_MAX_DATA_URL_CHARS,
  TRY_ON_MAX_EDGE,
  encodePhotoWithinBudget,
  fitWithin,
} from './try-on-photo'

const MB = 1024 * 1024
const PHONE_WIDTH = 4032
const PHONE_HEIGHT = 3024

describe('fitWithin', () => {
  it('scales the longer edge down to the limit and keeps the aspect ratio', () => {
    expect(fitWithin(4032, 3024, 1536)).toEqual({ width: 1536, height: 1152 })
    expect(fitWithin(3024, 4032, 1536)).toEqual({ width: 1152, height: 1536 })
  })

  it('never upscales small images', () => {
    expect(fitWithin(800, 600, 1536)).toEqual({ width: 800, height: 600 })
  })

  it('never returns a zero-sized edge for extreme aspect ratios', () => {
    expect(fitWithin(20000, 1, 1536).height).toBe(1)
  })
})

describe('encodePhotoWithinBudget with a large phone photo', () => {
  let fixture: Buffer

  beforeAll(async () => {
    // Random noise is the worst case for JPEG: it cannot be compressed away,
    // so a 12MP frame lands in the 8-12MB range of a real phone photo.
    const raw = randomBytes(PHONE_WIDTH * PHONE_HEIGHT * 3)
    fixture = await sharp(raw, { raw: { width: PHONE_WIDTH, height: PHONE_HEIGHT, channels: 3 } })
      .jpeg({ quality: 88 })
      .toBuffer()
  }, 60_000)

  const render = (width: number, height: number, quality: number) =>
    sharp(fixture)
      .resize(width, height)
      .jpeg({ quality: Math.round(quality * 100) })
      .toBuffer()
      .then((buf) => `data:image/jpeg;base64,${buf.toString('base64')}`)

  it('uses a fixture in the 8-12MB range', () => {
    expect(fixture.length).toBeGreaterThanOrEqual(8 * MB)
    expect(fixture.length).toBeLessThanOrEqual(12 * MB)
  })

  it('produces a JPEG data URL below 4MB (and the 3.5M-char budget)', async () => {
    const dataUrl = await encodePhotoWithinBudget(PHONE_WIDTH, PHONE_HEIGHT, render)

    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(dataUrl.length).toBeLessThan(4 * MB)
    expect(dataUrl.length).toBeLessThanOrEqual(TRY_ON_MAX_DATA_URL_CHARS)

    const meta = await sharp(Buffer.from(dataUrl.split(',')[1], 'base64')).metadata()
    expect(meta.format).toBe('jpeg')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(TRY_ON_MAX_EDGE)
  }, 60_000)
})

describe('encodePhotoWithinBudget fallback search', () => {
  it('returns the first attempt when it already fits', async () => {
    const render = vi.fn(() => 'data:image/jpeg;base64,AAAA')
    await expect(encodePhotoWithinBudget(4000, 3000, render, 100)).resolves.toBe('data:image/jpeg;base64,AAAA')
    expect(render).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledWith(1536, 1152, 0.85)
  })

  it('lowers quality, then size, until the result fits', async () => {
    const render = vi.fn((width: number, _height: number, quality: number) =>
      'x'.repeat(width === 1536 ? 1000 : quality === 0.85 ? 1000 : 10),
    )
    const out = await encodePhotoWithinBudget(4000, 3000, render, 100)
    expect(out.length).toBe(10)
    // 1536 edge fails at all three qualities, then 1280 fails at 0.85 and fits at 0.7
    expect(render).toHaveBeenCalledTimes(5)
  })

  it('throws PhotoTooLargeError when nothing fits', async () => {
    const render = () => 'x'.repeat(1000)
    await expect(encodePhotoWithinBudget(4000, 3000, render, 100)).rejects.toBeInstanceOf(PhotoTooLargeError)
  })
})
