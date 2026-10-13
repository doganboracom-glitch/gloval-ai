import { buildPdf } from '@/lib/logo-studio/pdf'
import { svgToDataUri, type EmblemAsset } from '@/lib/logo-studio/compose'
import type { Box } from '@/lib/logo-studio/ttf'

/** Browser-only helpers: measuring emblems and exporting SVG / PNG / PDF. */

/** Measures an emblem's real drawn bounds (AI emblems arrive without any). */
export function measureEmblem(e: EmblemAsset): EmblemAsset {
  if (e.bbox) return e
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', `0 0 ${e.viewBox.w} ${e.viewBox.h}`)
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  const g = document.createElementNS(ns, 'g')
  g.innerHTML = e.inner
  svg.appendChild(g)
  document.body.appendChild(svg)
  let bbox: Box = { x: 0, y: 0, w: e.viewBox.w, h: e.viewBox.h }
  try {
    const b = g.getBBox()
    if (b.width > 1 && b.height > 1) bbox = { x: b.x, y: b.y, w: b.width, h: b.height }
  } catch {
    // keep the full viewBox
  } finally {
    svg.remove()
  }
  return { ...e, bbox }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('svg render failed'))
    img.src = src
  })
}

async function rasterise(svg: string, width: number, height: number) {
  const img = await loadImage(svgToDataUri(svg))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

export async function svgToPngBlob(svg: string, w: number, h: number, targetWidth = 2000): Promise<Blob> {
  const scale = targetWidth / w
  const { canvas } = await rasterise(svg, targetWidth, h * scale)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png failed'))), 'image/png'),
  )
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function svgToPdfBlob(svg: string, w: number, h: number): Promise<Blob> {
  const pxW = 1600
  const pxH = Math.round((h / w) * pxW)
  const { ctx } = await rasterise(svg, pxW, pxH)
  const { data } = ctx.getImageData(0, 0, pxW, pxH)
  const rgb = new Uint8Array(pxW * pxH * 3)
  const alpha = new Uint8Array(pxW * pxH)
  for (let i = 0, p = 0, a = 0; i < data.length; i += 4) {
    rgb[p++] = data[i]
    rgb[p++] = data[i + 1]
    rgb[p++] = data[i + 2]
    alpha[a++] = data[i + 3]
  }
  const pageWidth = 360
  const bytes = await buildPdf({
    width: pxW,
    height: pxH,
    rgb,
    alpha,
    pageWidth,
    pageHeight: (h / w) * pageWidth,
    deflate,
  })
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function fileSlug(name: string): string {
  const s = name
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'logo'
}
