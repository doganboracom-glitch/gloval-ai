import { svgToDataUri, type Lockup, type LogoLayout } from '@/lib/logo-studio/compose'
import { USAGE_RULES, clearSpace, type LogoColors } from '@/lib/logo-studio/rules'
import { blobBytes, canvasToPdfBlob, loadImage, svgToPdfBlob, svgToPngBytes } from '@/lib/logo-studio/export'
import { buildZip, type ZipFile } from '@/lib/logo-studio/zip'

/**
 * Brand kit: a one-page A4 PDF (logo on light/dark, icon, colours, typeface,
 * minimum size and clear-space rules) and a ZIP with every export. The pure
 * parts (`brandKitSpec`, `brandKitFileNames`) are unit tested; rendering is
 * browser-only (canvas).
 */

export type Swatch = { name: string; hex: string }

export function brandKitSpec({
  layout,
  colors,
  lockup,
  labels,
}: {
  layout: LogoLayout
  colors: LogoColors
  lockup: Lockup
  labels: { primary: string; accent: string; text: string }
}) {
  const unique: Swatch[] = []
  for (const s of [
    { name: labels.primary, hex: colors.a },
    { name: labels.accent, hex: colors.b },
    { name: labels.text, hex: colors.ink },
  ]) {
    if (!unique.some((u) => u.hex.toLowerCase() === s.hex.toLowerCase())) unique.push(s)
  }
  const emblemH = lockup.emblemBox?.h ?? lockup.textCapBox?.h ?? lockup.height / 2
  return {
    swatches: unique,
    minSize: USAGE_RULES.minSize[layout],
    iconMin: USAGE_RULES.minSize.icon,
    clearSpaceUnits: clearSpace(emblemH),
    clearSpaceRatio: USAGE_RULES.clearSpaceRatio,
  }
}

/** Download names follow `<site-adi>-logo.*`. */
export function brandKitFileNames(slug: string) {
  const base = `${slug}-logo`
  return {
    svg: `${base}.svg`,
    svgLight: `${base}-light.svg`,
    svgDark: `${base}-dark.svg`,
    png: `${base}.png`,
    png2x: `${base}@2x.png`,
    pdf: `${base}.pdf`,
    icon: `${base}-icon.svg`,
    kit: `${base}-kit.pdf`,
    kitZip: `${base}-kit.zip`,
    faviconZip: `${base}-favicon.zip`,
    faviconDir: 'favicon/',
  }
}

export type BrandKitLabels = {
  title: string
  light: string
  dark: string
  icon: string
  colors: string
  typeface: string
  usage: string
  minSize: string
  clearSpace: string
}

export type BrandKitInput = {
  brand: string
  fontName: string
  layout: LogoLayout
  colors: LogoColors
  light: Lockup
  dark: Lockup
  iconSvg: string
  faviconSvgs: { size: number; svg: string }[]
  labels: BrandKitLabels
  swatchLabels: { primary: string; accent: string; text: string }
  darkSurface: string
  lightSurface: string
}

const PAGE_W = 595
const PAGE_H = 842
const SCALE = 2.5
const MARGIN = 40
const FONT = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'

async function drawSvg(ctx: CanvasRenderingContext2D, svg: string, x: number, y: number, w: number, h: number) {
  const img = await loadImage(svgToDataUri(svg))
  const ratio = Math.min(w / img.width, h / img.height)
  const dw = img.width * ratio
  const dh = img.height * ratio
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  return { dw, dh, ratio }
}

function heading(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.fillStyle = '#6b7280'
  ctx.font = `600 9px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text.toUpperCase(), MARGIN, y)
}

export async function renderBrandKitCanvas(input: BrandKitInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(PAGE_W * SCALE)
  canvas.height = Math.round(PAGE_H * SCALE)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  const spec = brandKitSpec({
    layout: input.layout,
    colors: input.colors,
    lockup: input.light,
    labels: input.swatchLabels,
  })
  const inner = PAGE_W - MARGIN * 2

  ctx.fillStyle = '#111827'
  ctx.font = `700 26px ${FONT}`
  ctx.fillText(input.brand, MARGIN, MARGIN + 22)
  ctx.fillStyle = '#6b7280'
  ctx.font = `400 11px ${FONT}`
  ctx.fillText(input.labels.title, MARGIN, MARGIN + 40)

  let y = MARGIN + 74
  const panelW = (inner - 12) / 2
  const panelH = 130
  heading(ctx, `${input.labels.light}  /  ${input.labels.dark}`, y - 8)
  const panels: [string, Lockup, number][] = [
    [input.lightSurface, input.light, MARGIN],
    [input.darkSurface, input.dark, MARGIN + panelW + 12],
  ]
  for (const [bg, lockup, x] of panels) {
    ctx.fillStyle = bg
    ctx.fillRect(x, y, panelW, panelH)
    ctx.strokeStyle = '#e5e7eb'
    ctx.strokeRect(x, y, panelW, panelH)
    await drawSvg(ctx, lockup.svg, x + 24, y + 24, panelW - 48, panelH - 48)
  }

  y += panelH + 34
  heading(ctx, input.labels.icon, y - 8)
  const tile = 84
  ctx.fillStyle = '#f3f4f6'
  ctx.fillRect(MARGIN, y, tile, tile)
  await drawSvg(ctx, input.iconSvg, MARGIN + 6, y + 6, tile - 12, tile - 12)
  let fx = MARGIN + tile + 20
  for (const fav of input.faviconSvgs) {
    const size = fav.size
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(fx, y + tile - size - 8, size + 16, size + 16)
    await drawSvg(ctx, fav.svg, fx + 8, y + tile - size, size, size)
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 8px ${FONT}`
    ctx.fillText(`${size}px`, fx, y + tile + 20)
    fx += size + 36
  }

  y += tile + 58
  heading(ctx, input.labels.colors, y - 8)
  let sx = MARGIN
  for (const sw of spec.swatches) {
    ctx.fillStyle = sw.hex
    ctx.fillRect(sx, y, 92, 48)
    ctx.strokeStyle = '#e5e7eb'
    ctx.strokeRect(sx, y, 92, 48)
    ctx.fillStyle = '#111827'
    ctx.font = `600 9px ${FONT}`
    ctx.fillText(sw.name, sx, y + 62)
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 9px ${FONT}`
    ctx.fillText(sw.hex.toUpperCase(), sx, y + 74)
    sx += 108
  }

  y += 112
  heading(ctx, input.labels.typeface, y - 8)
  ctx.fillStyle = '#111827'
  ctx.font = `600 16px ${FONT}`
  ctx.fillText(input.fontName, MARGIN, y + 14)

  y += 56
  heading(ctx, input.labels.usage, y - 8)
  ctx.fillStyle = '#374151'
  ctx.font = `400 10px ${FONT}`
  ctx.fillText(input.labels.minSize, MARGIN, y + 8)
  ctx.fillText(input.labels.clearSpace, MARGIN, y + 24)

  const boxW = 200
  const boxH = 70
  const bx = PAGE_W - MARGIN - boxW - 24
  const by = y - 6
  const { ratio } = await drawSvg(ctx, input.light.svg, bx, by, boxW, boxH)
  const pad = spec.clearSpaceUnits * ratio
  const drawnW = input.light.width * ratio
  const drawnH = input.light.height * ratio
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = '#9ca3af'
  ctx.strokeRect(bx + (boxW - drawnW) / 2 - pad, by + (boxH - drawnH) / 2 - pad, drawnW + pad * 2, drawnH + pad * 2)
  ctx.setLineDash([])
  return canvas
}

export async function renderBrandKitPdf(input: BrandKitInput): Promise<Blob> {
  return canvasToPdfBlob(await renderBrandKitCanvas(input), PAGE_W)
}

export async function buildBrandKitZip(
  input: BrandKitInput & { slug: string; faviconFiles: ZipFile[]; pngWidth: number },
): Promise<Blob> {
  const names = brandKitFileNames(input.slug)
  const enc = new TextEncoder()
  const png1 = await svgToPngBytes(input.light.svg, input.pngWidth, Math.round((input.light.height / input.light.width) * input.pngWidth))
  const png2 = await svgToPngBytes(
    input.light.svg,
    input.pngWidth * 2,
    Math.round((input.light.height / input.light.width) * input.pngWidth * 2),
  )
  const files: ZipFile[] = [
    { name: names.svg, data: enc.encode(input.light.svg) },
    { name: names.svgDark, data: enc.encode(input.dark.svg) },
    { name: names.png, data: png1 },
    { name: names.png2x, data: png2 },
    { name: names.pdf, data: await blobBytes(await svgToPdfBlob(input.light.svg, input.light.width, input.light.height)) },
    { name: names.icon, data: enc.encode(input.iconSvg) },
    { name: names.kit, data: await blobBytes(await renderBrandKitPdf(input)) },
    ...input.faviconFiles.map((f) => ({ name: `${names.faviconDir}${f.name}`, data: f.data })),
  ]
  return new Blob([buildZip(files) as BlobPart], { type: 'application/zip' })
}
