'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Loader2, RefreshCw, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveTheme } from '@/components/website-renderer/theme'
import { classifyLogoGenerateStatus } from '@/lib/logo-generate-status'
import {
  buildIcon,
  buildLockup,
  inkForSurface,
  svgToDataUri,
  type EmblemAsset,
  type LogoLayout,
  type LogoPalette,
  type TextAssets,
} from '@/lib/logo-studio/compose'
import {
  downloadBlob,
  fileSlug,
  measureEmblem,
  svgToPdfBlob,
  svgToPngBlob,
} from '@/lib/logo-studio/export'

export type LogoStudioFailure = 'auth' | 'credits' | 'dailyLimit' | 'failed'

type StudioData = {
  brand: string
  fontName: string
  text: TextAssets
  emblems: EmblemAsset[]
  palette: LogoPalette
  foreground: string
  aiFallback: boolean
}

const LAYOUTS: LogoLayout[] = ['horizontal', 'vertical', 'wordmark']
const LIGHT_SURFACE = '#ffffff'
const DARK_SURFACE = '#0b0d12'

export function LogoStudioDialog({
  site,
  mode,
  onClose,
  onApply,
  onFail,
}: {
  site: WebsiteSchema
  mode: 'local' | 'ai'
  onClose: () => void
  onApply: (src: string, source: 'ai' | 'generated') => void
  onFail: (kind: LogoStudioFailure) => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const theme = resolveTheme(site)
  const [data, setData] = useState<StudioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [seed, setSeed] = useState(0)
  const [selected, setSelected] = useState<LogoLayout>('horizontal')
  const [exporting, setExporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (nextSeed: number) => {
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
          }),
        })
        if (!res.ok) {
          const kind = classifyLogoGenerateStatus(res.status)
          if (kind === 'auth' || kind === 'credits' || kind === 'dailyLimit') {
            onFail(kind)
            onClose()
            return
          }
          setError(ui.studioFailed)
          return
        }
        const json = (await res.json()) as {
          brand: string
          fontName: string
          text: TextAssets
          emblems: EmblemAsset[]
          palette: LogoPalette
          foreground: string
          aiFallback: boolean
        }
        setData({ ...json, emblems: json.emblems.map(measureEmblem) })
        setSeed(nextSeed)
      } catch {
        setError(ui.studioFailed)
      } finally {
        setLoading(false)
      }
    },
    // The schema is only a request payload; re-fetching on every edit is wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  )

  useEffect(() => {
    void load(0)
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lockups = useMemo(() => {
    if (!data) return null
    const make = (layout: LogoLayout, ink: string) =>
      buildLockup({
        layout,
        emblem: layout === 'horizontal' ? data.emblems[0] : layout === 'vertical' ? data.emblems[1] : null,
        text: data.text,
        ink,
        palette: data.palette,
      })
    const light = inkForSurface('light', data.foreground)
    const dark = inkForSurface('dark', data.foreground)
    return Object.fromEntries(
      LAYOUTS.map((layout) => [
        layout,
        { site: make(layout, data.foreground), light: make(layout, light), dark: make(layout, dark) },
      ]),
    ) as Record<LogoLayout, { site: ReturnType<typeof make>; light: ReturnType<typeof make>; dark: ReturnType<typeof make> }>
  }, [data])

  const icon = useMemo(() => {
    if (!data) return null
    return svgToDataUri(
      buildIcon({
        layout: selected,
        emblem: selected === 'horizontal' ? data.emblems[0] : selected === 'vertical' ? data.emblems[1] : null,
        text: data.text,
        palette: data.palette,
      }),
    )
  }, [data, selected])

  const current = lockups?.[selected]
  const layoutLabel: Record<LogoLayout, string> = {
    horizontal: ui.studioLayoutHorizontal,
    vertical: ui.studioLayoutVertical,
    wordmark: ui.studioLayoutWordmark,
  }

  async function exportAs(kind: 'svg' | 'png' | 'pdf') {
    if (!current || !data) return
    setExporting(kind)
    setError(null)
    try {
      const { svg, width, height } = current.site
      const name = `${fileSlug(data.brand)}-logo`
      if (kind === 'svg') downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)
      else if (kind === 'png') downloadBlob(await svgToPngBlob(svg, width, height), `${name}.png`)
      else downloadBlob(await svgToPdfBlob(svg, width, height), `${name}.pdf`)
    } catch {
      setError(ui.studioFailed)
    } finally {
      setExporting(null)
    }
  }

  const hasAi = data?.emblems.some((e) => e.source === 'ai') ?? false

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ui.studioTitle}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-2xl"
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

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              {ui.studioLoading}
            </div>
          ) : null}

          {data && lockups ? (
            <>
              {data.aiFallback ? (
                <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {ui.studioAiFallback}
                </p>
              ) : null}

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
                      <span
                        className="flex h-28 items-center justify-center rounded-lg px-3"
                        style={{ backgroundColor: theme.background }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
                        <img
                          src={svgToDataUri(l.svg)}
                          alt={`${data.brand} — ${layoutLabel[layout]}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      </span>
                      <span className="flex items-center justify-between px-1 text-xs font-medium">
                        {layoutLabel[layout]}
                        {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>

              {current ? (
                <div className={`grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] ${loading ? 'opacity-50' : ''}`}>
                  {(
                    [
                      [ui.studioLight, LIGHT_SURFACE, current.light.svg],
                      [ui.studioDark, DARK_SURFACE, current.dark.svg],
                    ] as const
                  ).map(([label, bg, svg]) => (
                    <div key={label} className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <span
                        className="flex h-24 items-center justify-center rounded-lg border border-border px-3"
                        style={{ backgroundColor: bg }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
                        <img src={svgToDataUri(svg)} alt="" className="max-h-full max-w-full object-contain" />
                      </span>
                    </div>
                  ))}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{ui.studioFavicon}</span>
                    <div className="flex h-24 items-center gap-2">
                      {[LIGHT_SURFACE, DARK_SURFACE].map((bg) => (
                        <span
                          key={bg}
                          className="flex h-full w-20 items-end justify-center gap-1.5 rounded-lg border border-border pb-3"
                          style={{ backgroundColor: bg }}
                        >
                          {icon
                            ? [16, 32, 48].map((px) => (
                                // eslint-disable-next-line @next/next/no-img-element -- generated data URI
                                <img key={px} src={icon} alt="" width={px} height={px} style={{ width: px, height: px }} />
                              ))
                            : null}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {current ? (
                <div className={`flex flex-col gap-1.5 ${loading ? 'opacity-50' : ''}`}>
                  <span className="text-[11px] text-muted-foreground">{ui.studioHeaderPreview}</span>
                  <div
                    className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
                    style={{ backgroundColor: theme.background, borderColor: theme.border }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
                    <img
                      src={svgToDataUri(current.site.svg)}
                      alt={data.brand}
                      className="h-12 max-w-[200px] object-contain md:h-16 md:max-w-[280px]"
                    />
                    <span className="hidden items-center gap-4 text-xs sm:flex" style={{ color: theme.foreground }} aria-hidden="true">
                      <span>{ui.studioNavSample1}</span>
                      <span>{ui.studioNavSample2}</span>
                      <span className="rounded-md px-3 py-1.5 font-medium" style={{ backgroundColor: theme.primary, color: theme.primaryFg }}>
                        {ui.studioNavSample3}
                      </span>
                    </span>
                  </div>
                </div>
              ) : null}

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

          {hasAi ? <p className="text-[11px] text-muted-foreground">{ui.studioCostNote}</p> : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            disabled={!data || loading}
            onClick={() => void load(seed + 1)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {ui.studioAnother}
          </button>

          <div className="flex items-center gap-1.5">
            {(['svg', 'png', 'pdf'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={!current || loading || exporting !== null}
                onClick={() => void exportAs(kind)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium uppercase transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {exporting === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {kind}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!current || loading}
            onClick={() => current && onApply(svgToDataUri(current.site.svg), hasAi ? 'ai' : 'generated')}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {ui.studioUse}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
