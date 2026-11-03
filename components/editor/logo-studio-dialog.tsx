'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Loader2, RefreshCw, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveTheme } from '@/components/website-renderer/theme'
import { classifyLogoGenerateStatus } from '@/lib/logo-generate-status'
import {
  applyMetallicFinish,
  buildLockup,
  emblemBounds,
  LEGACY_LOGO_LAYOUTS,
  LOGO_LAYOUTS_V2,
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
import { LogoStudioV2Controls } from '@/components/editor/logo-studio-v2-controls'
import { wordIncludes } from '@/lib/visual-subjects'
import {
  recommendedLogoStyle,
  resolveLogoStudioSector,
  type LogoStudioLocale,
  type LogoStudioSectorId,
} from '@/lib/logo-studio/v2'
import type { TextPath } from '@/lib/logo-studio/ttf'
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
  METALLIC_TOKEN_COLORS,
  USAGE_RULES,
  resolveColorway,
  type ColorwayId,
  type LogoMetalTone,
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
import { AdvancedAiBadge } from '@/components/advanced-ai-badge'

export type LogoStudioFailure = 'auth' | 'planRequired' | 'credits' | 'dailyLimit' | 'failed'
export type LogoStudioIntent = 'logo' | 'favicon'
export type LogoStudioResult = {
  logo?: { src: string; source: 'ai' | 'generated' }
  favicon?: string
}

type StudioData = {
  brand: string
  fontName: string
  sectorFontName?: string
  sectorId?: LogoStudioSectorId
  sectorLabel?: string
  sectorText?: TextPath
  logoStudioV2?: boolean
  text: TextAssets
  aiEmblems: EmblemAsset[]
  context: string
  palette: LogoPalette
  aiFailed: boolean
}

type Choice = { t: 'ai'; i: number } | { t: 'local'; i: number } | { t: 'mono'; shape: 'circle' | 'square' }
type StudioLoadOptions = {
  style: LogoStyleId
  colorway: ColorwayId
  textOnly?: boolean
  v2?: boolean
  sectorId?: LogoStudioSectorId
  industryNotes?: string
  creativeDirection?: string
  metalTone?: LogoMetalTone
  locale?: LogoStudioLocale
}
const PICKS = 6
const FAVICON_PREFER: FaviconPrefer[] = ['auto', 'emblem', 'monogram']

function emblemThumb(e: EmblemAsset): string {
  const b = emblemBounds(e)
  const defs = e.svgDefs ? `<defs>${e.svgDefs}</defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${defs}${e.inner}</svg>`
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
  const { t, lang } = useLanguage()
  const ui = t.editor.ui
  const locale: LogoStudioLocale = lang === 'tr' ? 'tr' : 'en'
  const uiRef = useRef(ui)
  uiRef.current = ui
  const localeRef = useRef(locale)
  localeRef.current = locale
  const brandName = (site.navigation.logoText || site.meta.name).trim().slice(0, 60)
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
  const [v2Enabled, setV2Enabled] = useState(false)
  const [sectorId, setSectorId] = useState<LogoStudioSectorId>('other')
  const [industryNotes, setIndustryNotes] = useState('')
  const [creativeDirection, setCreativeDirection] = useState('')
  const [metalTone, setMetalTone] = useState<LogoMetalTone>('gold')
  const [stylePinned, setStylePinned] = useState(false)
  const [style, setStyle] = useState<LogoStyleId>('modern')
  const [colorway, setColorway] = useState<ColorwayId>('brand')
  const [selected, setSelected] = useState<LogoLayout>('horizontal')
  const [choice, setChoice] = useState<Choice>({ t: 'local', i: 0 })
  const [faviconPrefer, setFaviconPrefer] = useState<FaviconPrefer>('auto')
  const [applyFavicon, setApplyFavicon] = useState(intent === 'favicon' || !site.navigation.favicon?.src)
  const [exporting, setExporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const inflight = useRef<AbortController | null>(null)

  useEffect(() => () => inflight.current?.abort(), [])

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
    metallic: ui.studioColorMetallic,
  }
  const layoutLabel: Record<LogoLayout, string> = {
    horizontal: ui.studioLayoutHorizontal,
    vertical: v2Enabled ? ui.studioLayoutVerticalV2 : ui.studioLayoutVertical,
    wordmark: ui.studioLayoutWordmark,
    stacked: ui.studioLayoutStacked,
    badge: ui.studioLayoutBadge,
  }
  const layouts = v2Enabled ? LOGO_LAYOUTS_V2 : LEGACY_LOGO_LAYOUTS
  const colorways = v2Enabled ? COLORWAY_IDS : COLORWAY_IDS.filter((id) => id !== 'metallic')
  const directionContainsBrandName = !!creativeDirection.trim() && !!brandName && wordIncludes(creativeDirection, brandName)
  const faviconPreferLabel: Record<FaviconPrefer, string> = {
    auto: ui.studioFaviconAuto,
    emblem: ui.studioFaviconEmblem,
    monogram: ui.studioFaviconMonogram,
  }

  const load = useCallback(
    async (nextSeed: number, opts: StudioLoadOptions) => {
      const id = ++requestId.current
      // A superseded request is cancelled so the server can skip charging for
      // emblems nobody will see.
      inflight.current?.abort()
      const controller = new AbortController()
      inflight.current = controller
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/logo-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            schema: site,
            companyName: brandName,
            mode,
            seed: nextSeed,
            style: opts.style,
            colorMode: opts.v2 && opts.colorway === 'metallic' ? 'metallic' : opts.colorway === 'mono' ? 'mono' : 'duo',
            textOnly: opts.textOnly === true,
            ...(opts.v2
              ? {
                  sectorId: opts.sectorId ?? 'other',
                  industryNotes: opts.industryNotes ?? '',
                  creativeDirection: opts.creativeDirection ?? '',
                  metalTone: opts.metalTone ?? 'gold',
                  locale: opts.locale ?? 'en',
                }
              : {}),
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
        if (json.logoStudioV2 === true) setV2Enabled(true)
        const fresh = json.aiEmblems.map(measureEmblem)
        setData((prev) => ({
          ...json,
          aiEmblems: opts.textOnly ? (prev?.aiEmblems ?? []) : fresh,
        }))
        if (!opts.textOnly) {
          setSeed(nextSeed)
          setChoice(
            fresh.length > 0 ? { t: 'ai', i: 0 } : mode === 'ai' ? { t: 'mono', shape: 'circle' } : { t: 'local', i: 0 },
          )
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
    let cancelled = false
    const initialize = async () => {
      try {
        const response = await fetch('/api/logo-image', { method: 'GET', cache: 'no-store' })
        if (!response.ok) throw new Error('Logo Studio feature check failed')
        const features = (await response.json()) as { logoStudioV2?: boolean }
        if (cancelled) return
        if (features.logoStudioV2 === true) {
          const initialStyle = recommendedLogoStyle('other', 'gold')
          setV2Enabled(true)
          setStyle(initialStyle)
          if (mode === 'ai') setChoice({ t: 'mono', shape: 'circle' })
          await load(0, {
            style: initialStyle,
            colorway: 'brand',
            textOnly: mode === 'ai',
            v2: true,
            sectorId: 'other',
            industryNotes: '',
            creativeDirection: '',
            metalTone: 'gold',
            locale: localeRef.current,
          })
        } else {
          await load(0, { style: 'modern', colorway: 'brand' })
        }
      } catch {
        if (!cancelled) {
          setError(uiRef.current.studioFailed)
          setLoading(false)
        }
      }
    }
    void initialize()
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const picks = useMemo(() => {
    if (!data) return []
    const sectorContext = v2Enabled ? `${sectorId} ${industryNotes} ${creativeDirection}`.trim() : data.context
    const localSectorId = v2Enabled ? resolveLogoStudioSector(sectorId, locale)?.localId : undefined
    return pickLocalEmblems({
      count: PICKS,
      brand: data.brand,
      context: sectorContext,
      seed: localSeed,
      sectorId: localSectorId,
    })
  }, [data?.brand, data?.context, localSeed, v2Enabled, sectorId, industryNotes, creativeDirection, locale])

  const emblemFor = useCallback(
    (c: Choice, colors: ReturnType<typeof resolveColorway>): EmblemAsset | null => {
      if (!data) return null
      const metallic = v2Enabled && colorway === 'metallic'
      const iconColors = metallic
        ? {
            ...colors,
            a: METALLIC_TOKEN_COLORS.mid,
            b: METALLIC_TOKEN_COLORS.light,
            ink: METALLIC_TOKEN_COLORS.dark,
            fg: METALLIC_TOKEN_COLORS.dark,
          }
        : colors
      if (c.t === 'ai') {
        const ai = data.aiEmblems[c.i]
        if (!ai) return null
        if (metallic) return applyMetallicFinish(ai, metalTone)
        return recolorEmblem(ai, {
          [data.palette.primary]: colors.a,
          [data.palette.accent]: colors.b,
          ...(v2Enabled
            ? {
                [METALLIC_TOKEN_COLORS.light]: colors.b,
                [METALLIC_TOKEN_COLORS.mid]: colors.a,
                [METALLIC_TOKEN_COLORS.dark]: colors.a,
              }
            : {}),
        })
      }
      if (c.t === 'mono') {
        const emblem = monogramEmblem({ mono: data.text.mono, shape: c.shape, colors: iconColors, style })
        return metallic ? applyMetallicFinish(emblem, metalTone) : emblem
      }
      const pick = picks[c.i] ?? picks[0]
      if (!pick) return null
      const emblem = drawLocalEmblem(pick, style, iconColors)
      return metallic ? applyMetallicFinish(emblem, metalTone) : emblem
    },
    [data, picks, style, v2Enabled, colorway, metalTone],
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
        sectorLabel: v2Enabled ? data.sectorText : undefined,
      })
    }
    return Object.fromEntries(
      layouts.map((layout) => [layout, { site: make(layout, 'site'), light: make(layout, 'light'), dark: make(layout, 'dark') }]),
    ) as Record<LogoLayout, { site: Lockup; light: Lockup; dark: Lockup }>
  }, [data, colorway, siteColors, emblemFor, choice, style, v2Enabled, layouts])

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

  function v2Options(overrides: Partial<StudioLoadOptions> = {}): StudioLoadOptions {
    return {
      style,
      colorway,
      v2: v2Enabled,
      sectorId,
      industryNotes,
      creativeDirection,
      metalTone,
      locale,
      ...overrides,
    }
  }

  function updateSector(next: LogoStudioSectorId) {
    if (next === sectorId) return
    setSectorId(next)
    const nextStyle = stylePinned ? style : recommendedLogoStyle(next, metalTone)
    if (!stylePinned) setStyle(nextStyle)
    if (data) void load(seed, v2Options({ sectorId: next, style: nextStyle, textOnly: true }))
  }

  function changeStyle(next: LogoStyleId) {
    if (next === style || !data) return
    setStylePinned(true)
    setStyle(next)
    if (!v2Enabled) {
      void load(seed, { style: next, colorway, textOnly: true })
      return
    }
    void load(seed, v2Options({ style: next, textOnly: mode === 'local' || !hasAi }))
  }

  function another() {
    if (!data) return
    if (v2Enabled && mode === 'ai' && directionContainsBrandName) {
      setError(ui.studioV2DirectionBrandName)
      return
    }
    setLocalSeed((s) => s + 1)
    if (mode === 'ai') {
      const nextSeed = v2Enabled && !hasAi ? seed : seed + 1
      void load(nextSeed, v2Enabled ? v2Options({ textOnly: false }) : { style, colorway })
    } else {
      setChoice({ t: 'local', i: 0 })
    }
  }

  function changeColorway(next: ColorwayId) {
    if (next === colorway) return
    const monoNeedsRefresh = (next === 'mono' || colorway === 'mono') && !(v2Enabled && colorway === 'metallic')
    const enteringMetallic = v2Enabled && next === 'metallic' && colorway !== 'metallic'
    const needsRedraw = mode === 'ai' && choice.t === 'ai' && (monoNeedsRefresh || enteringMetallic)
    setColorway(next)
    if (needsRedraw) {
      void load(seed, v2Enabled ? v2Options({ colorway: next, textOnly: false }) : { style, colorway: next })
    }
  }

  function changeMetalTone(next: LogoMetalTone) {
    if (next === metalTone || !v2Enabled) return
    setMetalTone(next)
    const nextStyle = stylePinned ? style : recommendedLogoStyle(sectorId, next)
    if (!stylePinned) setStyle(nextStyle)
    if (data) void load(seed, v2Options({ metalTone: next, style: nextStyle, textOnly: true }))
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
  const displayedTypeface =
    data?.sectorFontName && data.sectorFontName !== data.fontName ? `${data.fontName} + ${data.sectorFontName}` : data?.fontName
  const sameChoice = (c: Choice) => JSON.stringify(c) === JSON.stringify(choice)

  const candidates: { key: string; c: Choice; svg: string }[] = data
    ? [
        ...data.aiEmblems.flatMap((_, i) => {
          const e = emblemFor({ t: 'ai', i }, thumbColors)
          return e ? [{ key: `ai-${i}`, c: { t: 'ai', i } as Choice, svg: emblemThumb(e) }] : []
        }),
        // A library symbol would not match the business, so AI mode never shows one.
        ...(mode === 'local' ? picks : []).map((_, i) => {
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
            <AdvancedAiBadge flow="logoEmblem" className="mt-1.5 w-fit self-start" />
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
              {data.aiFailed ? (
                <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {ui.studioAiFailed}
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
                  {colorways.map((id) => (
                    <button key={id} type="button" aria-pressed={id === colorway} onClick={() => changeColorway(id)} className={chip(id === colorway)}>
                      {colorLabel[id]}
                    </button>
                  ))}
                </div>
              </section>

              {v2Enabled ? (
                <LogoStudioV2Controls
                  locale={locale}
                  sectorId={sectorId}
                  onSectorChange={updateSector}
                  industryNotes={industryNotes}
                  onIndustryNotesChange={setIndustryNotes}
                  creativeDirection={creativeDirection}
                  onCreativeDirectionChange={(value) => {
                    setCreativeDirection(value)
                    setError(null)
                  }}
                  directionContainsBrandName={directionContainsBrandName}
                  tone={metalTone}
                  onToneChange={changeMetalTone}
                  showDirection={mode === 'ai'}
                  showMetalTones={colorway === 'metallic'}
                  disabled={busy}
                  copy={{
                    section: ui.studioV2Section,
                    sector: ui.studioV2Sector,
                    notes: ui.studioV2Notes,
                    notesPlaceholder: ui.studioV2NotesPlaceholder,
                    notesHint: ui.studioV2NotesHint,
                    direction: ui.studioV2Direction,
                    directionPlaceholder: ui.studioV2DirectionPlaceholder,
                    directionHint: ui.studioV2DirectionHint,
                    directionBrandName: ui.studioV2DirectionBrandName,
                    metal: ui.studioV2Metal,
                    gold: ui.studioV2MetalGold,
                    silver: ui.studioV2MetalSilver,
                    bronze: ui.studioV2MetalBronze,
                    metalHint: ui.studioV2MetalHint,
                  }}
                />
              ) : null}

              <section className={`flex flex-col gap-2 ${loading ? 'opacity-50' : ''}`} aria-label={ui.studioEmblems}>
                <span className="text-[11px] text-muted-foreground">{ui.studioEmblems}</span>
                {v2Enabled && mode === 'ai' && !hasAi && !data.aiFailed ? (
                  <p role="status" className="text-sm leading-relaxed text-muted-foreground">
                    {ui.studioV2NextRoundHint}
                  </p>
                ) : null}
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

              <div className={`grid grid-cols-1 gap-2 ${v2Enabled ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-3'} ${loading ? 'opacity-50' : ''}`}>
                {layouts.map((layout) => {
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
                {ui.studioFontNote} {displayedTypeface}
                {v2Enabled ? ` · ${ui.studioV2TypefaceHint}` : ''}
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
              {v2Enabled && mode === 'ai' && !hasAi && !data?.aiFailed ? ui.studioV2Generate : ui.studioAnother}
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
