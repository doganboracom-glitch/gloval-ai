'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Loader2, RefreshCw, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveTheme } from '@/components/website-renderer/theme'
import { classifyLogoGenerateStatus } from '@/lib/logo-generate-status'
import {
  buildLockup,
  emblemBounds,
  monogramEmblem,
  recolorEmblem,
  svgToDataUri,
  type EmblemAsset,
  type Lockup,
  type LogoLayout,
  type LogoPalette,
  type TextAssets,
} from '@/lib/logo-studio/compose'
import { drawLocalEmblem, pickLocalEmblems } from '@/lib/logo-studio/emblem-local'
import {
  buildFaviconSvg,
  buildFaviconVariants,
  resolveFaviconKind,
  type FaviconPrefer,
} from '@/lib/logo-studio/favicon'
import {
  COLORWAY_IDS,
  DARK_SURFACE,
  LIGHT_SURFACE,
  AI_EMBLEMS_PER_ROUND,
  LOGO_EMBLEM_CREDITS,
  LOGO_STYLE_IDS,
  USAGE_RULES,
  resolveColorway,
  type ColorwayId,
  type LogoStyleId,
  type SiteColors,
} from '@/lib/logo-studio/rules'
import {
  blobBytes,
  bytesToDataUri,
  downloadBlob,
  fileSlug,
  measureEmblem,
  renderFaviconFiles,
  svgToPdfBlob,
  svgToPngBlob,
} from '@/lib/logo-studio/export'
import { brandKitFileNames, buildBrandKitZip, renderBrandKitPdf, type BrandKitInput } from '@/lib/logo-studio/brand-kit'
import { buildZip } from '@/lib/logo-studio/zip'
import { FaviconPreview, SurfacePreviews } from '@/components/editor/logo-studio-previews'

export type LogoStudioFailure = 'auth' | 'planRequired' | 'credits' | 'dailyLimit' | 'failed'
export type LogoStudioIntent = 'logo' | 'favicon'
export type LogoStudioResult = {
  logo?: { src: string; source: 'ai' | 'generated' }
  favicon?: string
}

type StudioData = {
  brand: string
  fontName: string
  text: TextAssets
  aiEmblems: EmblemAsset[]
  context: string
  palette: LogoPalette
  aiFallback: boolean
}

type Choice = { t: 'ai'; i: number } | { t: 'local'; i: number } | { t: 'mono'; shape: 'circle' | 'square' }

const LAYOUTS: LogoLayout[] = ['horizontal', 'vertical', 'wordmark']
const PICKS = 6
const FAVICON_PREFER: FaviconPrefer[] = ['auto', 'emblem', 'monogram']

function emblemThumb(e: EmblemAsset): string {
  const b = emblemBounds(e)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${e.inner}</svg>`
}

export function LogoStudioDialog({
  site,
  mode,
  intent = 'logo',
  onClose,
  onApply,
  onFail,
}: {
  site: WebsiteSchema
  mode: 'local' | 'ai'
  intent?: LogoStudioIntent
  onClose: () => void
  onApply: (result: LogoStudioResult) => void
  onFail: (kind: LogoStudioFailure) => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const theme = resolveTheme(site)
  const siteColors: SiteColors = useMemo(
    () => ({
      primary: theme.primary,
      primaryFg: theme.primaryFg,
      accent: theme.accent,
      foreground: theme.foreground,
      background: theme.background,
    }),
    [theme.primary, theme.primaryFg, theme.accent, theme.foreground, theme.background],
  )

  const [data, setData] = useState<StudioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [seed, setSeed] = useState(0)
  const [localSeed, setLocalSeed] = useState(0)
  const [style, setStyle] = useState<LogoStyleId>('modern')
  const [colorway, setColorway] = useState<ColorwayId>('brand')
  const [selected, setSelected] = useState<LogoLayout>('horizontal')
  const [choice, setChoice] = useState<Choice>({ t: 'local', i: 0 })
  const [faviconPrefer, setFaviconPrefer] = useState<FaviconPrefer>('auto')
  const [applyFavicon, setApplyFavicon] = useState(intent === 'favicon' || !site.navigation.favicon?.src)
  const [exporting, setExporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const styleLabel: Record<LogoStyleId, string> = {
    modern: ui.studioStyleModern,
    classic: ui.studioStyleClassic,
    minimal: ui.studioStyleMinimal,
    luxury: ui.studioStyleLuxury,
  }
  const colorLabel: Record<ColorwayId, string> = {
    brand: ui.studioColorBrand,
    swap: ui.studioColorSwap,
    ink: ui.studioColorInk,
    mono: ui.studioColorMono,
    reverse: ui.studioColorReverse,
  }
  const layoutLabel: Record<LogoLayout, string> = {
    horizontal: ui.studioLayoutHorizontal,
    vertical: ui.studioLayoutVertical,
    wordmark: ui.studioLayoutWordmark,
  }
  const faviconPreferLabel: Record<FaviconPrefer, string> = {
    auto: ui.studioFaviconAuto,
    emblem: ui.studioFaviconEmblem,
    monogram: ui.studioFaviconMonogram,
  }

  const load = useCallback(
    async (nextSeed: number, opts: { style: LogoStyleId; colorway: ColorwayId; textOnly?: boolean }) => {
      const id = ++requestId.current
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/logo-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schema: site,
            companyName: site.navigation.logoText || site.meta.name,
            mode,
            seed: nextSeed,
            style: opts.style,
            colorMode: opts.colorway === 'mono' ? 'mono' : 'duo',
            textOnly: opts.textOnly === true,
          }),
        })
        if (id !== requestId.current) return
        if (!res.ok) {
          const kind = classifyLogoGenerateStatus(res.status)
          if (kind === 'auth' || kind === 'planRequired' || kind === 'credits' || kind === 'dailyLimit') {
            onFail(kind)
            onClose()
            return
          }
          setError(ui.studioFailed)
          return
        }
        const json = (await res.json()) as Omit<StudioData, 'aiEmblems'> & { aiEmblems: EmblemAsset[] }
        if (id !== requestId.current) return
        const fresh = json.aiEmblems.map(measureEmblem)
        setData((prev) => ({
          ...json,
          aiEmblems: opts.textOnly ? (prev?.aiEmblems ?? []) : fresh,
        }))
        if (!opts.textOnly) {
          setSeed(nextSeed)
          setChoice(fresh.length > 0 ? { t: 'ai', i: 0 } : { t: 'local', i: 0 })
        }
      } catch {
        if (id === requestId.current) setError(ui.studioFailed)
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    // The schema is only a request payload; re-fetching on every edit is wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  )

  useEffect(() => {
    void load(0, { style: 'modern', colorway: 'brand' })
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const picks = useMemo(
    () => (data ? pickLocalEmblems({ count: PICKS, brand: data.brand, context: data.context, seed: localSeed }) : []),
    [data?.brand, data?.context, localSeed], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const emblemFor = useCallback(
    (c: Choice, colors: ReturnType<typeof resolveColorway>): EmblemAsset | null => {
      if (!data) return null
      if (c.t === 'ai') {
        const ai = data.aiEmblems[c.i]
        if (!ai) return null
        return recolorEmblem(ai, { [data.palette.primary]: colors.a, [data.palette.accent]: colors.b })
      }
      if (c.t === 'mono') return monogramEmblem({ mono: data.text.mono, shape: c.shape, colors, style })
      const pick = picks[c.i] ?? picks[0]
      return pick ? drawLocalEmblem(pick, style, colors) : null
    },
    [data, picks, style],
  )

  const lockups = useMemo(() => {
    if (!data) return null
    const make = (layout: LogoLayout, surface: 'site' | 'light' | 'dark'): Lockup => {
      const colors = resolveColorway(colorway, siteColors, surface)
      return buildLockup({
        layout,
        emblem: layout === 'wordmark' ? null : emblemFor(choice, colors),
        text: data.text,
        colors,
        style,
      })
    }
    return Object.fromEntries(
      LAYOUTS.map((layout) => [layout, { site: make(layout, 'site'), light: make(layout, 'light'), dark: make(layout, 'dark') }]),
    ) as Record<LogoLayout, { site: Lockup; light: Lockup; dark: Lockup }>
  }, [data, colorway, siteColors, emblemFor, choice, style])

  const faviconColors = useMemo(
    () => resolveColorway(colorway === 'reverse' ? 'brand' : colorway, siteColors, 'light'),
    [colorway, siteColors],
  )
  const faviconInput = useMemo(() => {
    if (!data) return null
    return {
      emblem: choice.t === 'mono' ? null : emblemFor(choice, faviconColors),
      text: data.text,
      colors: faviconColors,
      style,
      prefer: faviconPrefer,
    }
  }, [data, choice, emblemFor, faviconColors, style, faviconPrefer])
  const faviconVariants = useMemo(() => (faviconInput ? buildFaviconVariants(faviconInput) : []), [faviconInput])
  const faviconKind = faviconInput ? resolveFaviconKind(faviconInput) : 'monogram'
  const autoFellBack = faviconPrefer === 'auto' && faviconKind === 'monogram' && choice.t !== 'mono' && !!faviconInput?.emblem

  const current = lockups?.[selected]
  const hasAi = data ? data.aiEmblems.length > 0 : false
  const busy = loading || exporting !== null

  function changeStyle(next: LogoStyleId) {
    if (next === style || !data) return
    setStyle(next)
    void load(seed, { style: next, colorway, textOnly: true })
  }

  function another() {
    if (!data) return
    setLocalSeed((s) => s + 1)
    if (mode === 'ai') void load(seed + 1, { style, colorway })
    else setChoice({ t: 'local', i: 0 })
  }

  function changeColorway(next: ColorwayId) {
    if (next === colorway) return
    const needsRedraw = mode === 'ai' && (next === 'mono' || colorway === 'mono') && choice.t === 'ai'
    setColorway(next)
    if (needsRedraw) void load(seed, { style, colorway: next })
  }

  const kitInput = useCallback(
    (): BrandKitInput | null => {
      if (!data || !lockups || !faviconInput) return null
      const colors = resolveColorway(colorway, siteColors, 'light')
      const icon512 = faviconVariants.find((v) => v.size === 512)
      if (!icon512) return null
      return {
        brand: data.brand,
        fontName: data.fontName,
        layout: selected,
        colors,
        light: lockups[selected].light,
        dark: lockups[selected].dark,
        iconSvg: icon512.svg,
        faviconSvgs: [16, 32, 48].flatMap((size) => {
          const v = faviconVariants.find((x) => x.size === size)
          return v ? [{ size, svg: v.svg }] : []
        }),
        labels: {
          title: ui.kitTitle,
          light: ui.kitLight,
          dark: ui.kitDark,
          icon: ui.kitIcon,
          colors: ui.kitColors,
          typeface: ui.kitTypeface,
          usage: ui.kitUsage,
          minSize: ui.kitMinSize
            .replace('{px}', String(USAGE_RULES.minSize[selected].px))
            .replace('{mm}', String(USAGE_RULES.minSize[selected].mm)),
          clearSpace: ui.kitClearSpace,
        },
        swatchLabels: { primary: ui.kitPrimary, accent: ui.kitAccent, text: ui.kitText },
        darkSurface: colorway === 'reverse' ? siteColors.primary : DARK_SURFACE,
        lightSurface: colorway === 'reverse' ? siteColors.primary : LIGHT_SURFACE,
      }
    },
    [data, lockups, faviconInput, faviconVariants, colorway, siteColors, selected, ui],
  )

  async function run(kind: string, job: () => Promise<void>) {
    setExporting(kind)
    setError(null)
    try {
      await job()
    } catch {
      setError(ui.studioFailed)
    } finally {
      setExporting(null)
    }
  }

  function exportAs(kind: 'svg' | 'png' | 'pdf') {
    if (!current || !data) return
    void run(kind, async () => {
      const { svg, width, height } = current.site
      const name = brandKitFileNames(fileSlug(data.brand))
      if (kind === 'svg') downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), name.svg)
      else if (kind === 'png') downloadBlob(await svgToPngBlob(svg, width, height), name.png)
      else downloadBlob(await svgToPdfBlob(svg, width, height), name.pdf)
    })
  }

  function downloadFavicon() {
    if (!data) return
    void run('favicon', async () => {
      const files = await renderFaviconFiles(faviconVariants)
      const names = brandKitFileNames(fileSlug(data.brand))
      downloadBlob(new Blob([buildZip(files) as BlobPart], { type: 'application/zip' }), names.faviconZip)
    })
  }

  function downloadKit(kind: 'pdf' | 'zip') {
    const input = kitInput()
    if (!input || !data) return
    void run(`kit-${kind}`, async () => {
      const names = brandKitFileNames(fileSlug(data.brand))
      if (kind === 'pdf') {
        downloadBlob(await renderBrandKitPdf(input), names.kit)
      } else {
        const faviconFiles = await renderFaviconFiles(faviconVariants)
        downloadBlob(
          await buildBrandKitZip({ ...input, slug: fileSlug(data.brand), faviconFiles, pngWidth: 1000 }),
          names.kitZip,
        )
      }
    })
  }

  function apply() {
    if (!current || !data) return
    void run('apply', async () => {
      const result: LogoStudioResult = {}
      if (intent === 'logo') {
        result.logo = { src: svgToDataUri(current.site.svg), source: hasAi && choice.t === 'ai' ? 'ai' : 'generated' }
      }
      if (applyFavicon || intent === 'favicon') {
        const v = faviconVariants.find((x) => x.size === 512)
        if (v) result.favicon = bytesToDataUri(await blobBytes(await svgToPngBlob(v.svg, 512, 512, 512)), 'image/png')
      }
      onApply(result)
    })
  }

  const previewStrings = {
    header: ui.studioHeaderPreview,
    footer: ui.studioFooterPreview,
    light: ui.studioLight,
    dark: ui.studioDark,
    nav1: ui.studioNavSample1,
    nav2: ui.studioNavSample2,
    nav3: ui.studioNavSample3,
    tabSample: ui.studioFaviconTitle,
    faviconSizes: ui.studioFavicon,
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
    }`

  const thumbBg = colorway === 'reverse' ? siteColors.primary : siteColors.background
  const thumbColors = resolveColorway(colorway, siteColors, 'site')
  const sameChoice = (c: Choice) => JSON.stringify(c) === JSON.stringify(choice)

  const candidates: { key: string; c: Choice; svg: string }[] = data
    ? [
        ...data.aiEmblems.flatMap((_, i) => {
          const e = emblemFor({ t: 'ai', i }, thumbColors)
          return e ? [{ key: `ai-${i}`, c: { t: 'ai', i } as Choice, svg: emblemThumb(e) }] : []
        }),
        ...picks.map((_, i) => {
          const e = emblemFor({ t: 'local', i }, thumbColors)
          return { key: `local-${i}`, c: { t: 'local', i } as Choice, svg: e ? emblemThumb(e) : '' }
        }),
        ...(['circle', 'square'] as const).map((shape) => ({
          key: `mono-${shape}`,
          c: { t: 'mono', shape } as Choice,
          svg: emblemThumb(monogramEmblem({ mono: data.text.mono, shape, colors: thumbColors, style })),
        })),
      ]
    : []

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ui.studioTitle}
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-balance">{ui.studioTitle}</h2>
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              {mode === 'ai' ? ui.studioDescAi : ui.studioDescLocal}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui.studioClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              {ui.studioLoading}
            </div>
          ) : null}

          {data && lockups && current ? (
            <>
              {data.aiFallback ? (
                <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {ui.studioAiFallback}
                </p>
              ) : null}

              <section className="flex flex-col gap-2" aria-label={ui.studioStyle}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 w-12 text-[11px] text-muted-foreground">{ui.studioStyle}</span>
                  {LOGO_STYLE_IDS.map((id) => (
                    <button key={id} type="button" aria-pressed={id === style} onClick={() => changeStyle(id)} className={chip(id === style)}>
                      {styleLabel[id]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 w-12 text-[11px] text-muted-foreground">{ui.studioColors}</span>
                  {COLORWAY_IDS.map((id) => (
                    <button key={id} type="button" aria-pressed={id === colorway} onClick={() => changeColorway(id)} className={chip(id === colorway)}>
                      {colorLabel[id]}
                    </button>
                  ))}
                </div>
              </section>

              <section className={`flex flex-col gap-2 ${loading ? 'opacity-50' : ''}`} aria-label={ui.studioEmblems}>
                <span className="text-[11px] text-muted-foreground">{ui.studioEmblems}</span>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-10">
                  {candidates.map((cand) => {
                    const active = sameChoice(cand.c)
                    return (
                      <button
                        key={cand.key}
                        type="button"
                        aria-pressed={active}
                        aria-label={cand.c.t === 'mono' ? (cand.c.shape === 'circle' ? ui.studioMonoCircle : ui.studioMonoSquare) : ui.studioEmblems}
                        onClick={() => setChoice(cand.c)}
                        className={`flex aspect-square items-center justify-center rounded-lg border p-2 transition-colors ${
                          active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/60'
                        }`}
                        style={{ backgroundColor: thumbBg }}
                      >
                        {cand.svg ? (
                          // eslint-disable-next-line @next/next/no-img-element -- generated data URI
                          <img src={svgToDataUri(cand.svg)} alt="" className="max-h-full max-w-full object-contain" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </section>

              <div className={`grid grid-cols-1 gap-2 sm:grid-cols-3 ${loading ? 'opacity-50' : ''}`}>
                {LAYOUTS.map((layout) => {
                  const l = lockups[layout].site
                  const active = layout === selected
                  return (
                    <button
                      key={layout}
                      type="button"
                      onClick={() => setSelected(layout)}
                      aria-pressed={active}
                      className={`flex flex-col gap-2 rounded-xl border p-2 text-left transition-colors ${
                        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/60'
                      }`}
                    >
                      <span className="flex h-28 items-center justify-center rounded-lg px-3" style={{ backgroundColor: thumbBg }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
                        <img src={svgToDataUri(l.svg)} alt={`${data.brand} — ${layoutLabel[layout]}`} className="max-h-full max-w-full object-contain" />
                      </span>
                      <span className="flex items-center justify-between px-1 text-xs font-medium">
                        {layoutLabel[layout]}
                        {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>

              <SurfacePreviews
                lightSvg={current.light.svg}
                darkSvg={current.dark.svg}
                canvas={colorway === 'reverse' ? siteColors.primary : undefined}
                brand={data.brand}
                strings={previewStrings}
                dim={loading}
              />

              <section className="flex flex-col gap-2" aria-label={ui.studioFaviconTitle}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] text-muted-foreground">{ui.studioFaviconTitle}</span>
                  {FAVICON_PREFER.map((id) => (
                    <button key={id} type="button" aria-pressed={id === faviconPrefer} onClick={() => setFaviconPrefer(id)} className={chip(id === faviconPrefer)}>
                      {faviconPreferLabel[id]}
                    </button>
                  ))}
                </div>
                {autoFellBack ? <p className="text-[11px] leading-relaxed text-muted-foreground">{ui.studioFaviconAutoNote}</p> : null}
                <FaviconPreview variants={faviconVariants} brand={data.brand} strings={previewStrings} dim={loading} />
              </section>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {ui.studioFontNote} {data.fontName}
                {hasAi ? ' · AI' : ''}
              </p>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {mode === 'ai' ? (
            <p className="text-[11px] text-muted-foreground">
              {ui.studioCostNote
                .replace('{count}', String(AI_EMBLEMS_PER_ROUND))
                .replace('{each}', String(LOGO_EMBLEM_CREDITS))
                .replace('{max}', String(AI_EMBLEMS_PER_ROUND * LOGO_EMBLEM_CREDITS))}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-col gap-3 border-t border-border px-5 py-3">
          {intent === 'logo' ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={applyFavicon} onChange={(e) => setApplyFavicon(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
              {ui.studioApplyFavicon}
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!data || busy}
              onClick={another}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {ui.studioAnother}
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['svg', 'png', 'pdf'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!current || busy}
                  onClick={() => exportAs(kind)}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium uppercase transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {exporting === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {kind}
                </button>
              ))}
              {(
                [
                  ['favicon', ui.studioDownloadFavicon, downloadFavicon],
                  ['kit-pdf', ui.studioKitPdf, () => downloadKit('pdf')],
                  ['kit-zip', ui.studioKitZip, () => downloadKit('zip')],
                ] as const
              ).map(([key, label, action]) => (
                <button
                  key={key}
                  type="button"
                  disabled={!current || busy}
                  onClick={action}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {exporting === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!current || busy}
              onClick={apply}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {exporting === 'apply' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {ui.studioUse}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
