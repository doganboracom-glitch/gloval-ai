'use client'

import { svgToDataUri } from '@/lib/logo-studio/compose'
import { DARK_SURFACE, LIGHT_SURFACE } from '@/lib/logo-studio/rules'
import type { FaviconVariant } from '@/lib/logo-studio/favicon'

type Strings = {
  header: string
  footer: string
  light: string
  dark: string
  nav1: string
  nav2: string
  nav3: string
  tabSample: string
  faviconSizes: string
}

/** The chosen logo in a site header and footer, on a light and a dark surface. */
export function SurfacePreviews({
  lightSvg,
  darkSvg,
  canvas,
  brand,
  strings,
  dim,
}: {
  lightSvg: string
  darkSvg: string
  /** Reversed colourway: both surfaces are the brand colour. */
  canvas?: string
  brand: string
  strings: Strings
  dim: boolean
}) {
  const surfaces = [
    { key: 'light', label: strings.light, bg: canvas ?? LIGHT_SURFACE, fg: canvas ? '#ffffff' : '#111827', svg: lightSvg },
    { key: 'dark', label: strings.dark, bg: canvas ?? DARK_SURFACE, fg: '#f8fafc', svg: darkSvg },
  ]
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${dim ? 'opacity-50' : ''}`}>
      {surfaces.map((s) => (
        <div key={s.key} className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {strings.header} · {s.label}
          </span>
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            style={{ backgroundColor: s.bg, color: s.fg }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
            <img src={svgToDataUri(s.svg)} alt={brand} className="h-10 max-w-[150px] object-contain object-left" />
            <span className="hidden items-center gap-3 text-[11px] sm:flex" aria-hidden="true">
              <span>{strings.nav1}</span>
              <span>{strings.nav2}</span>
              <span>{strings.nav3}</span>
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {strings.footer} · {s.label}
          </span>
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3"
            style={{ backgroundColor: s.bg, color: s.fg }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
            <img src={svgToDataUri(s.svg)} alt="" className="h-8 max-w-[120px] object-contain object-left" />
            <span className="text-[10px] opacity-70" aria-hidden="true">
              © {brand}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Browser-tab mock-ups plus the real 16/32/48 px renders and the 180 px touch icon. */
export function FaviconPreview({
  variants,
  brand,
  strings,
  dim,
}: {
  variants: FaviconVariant[]
  brand: string
  strings: Strings
  dim: boolean
}) {
  const by = (size: number) => variants.find((v) => v.size === size)
  const small = by(16)
  const tabs = [
    { key: 'light', bg: '#e5e7eb', tab: LIGHT_SURFACE, fg: '#111827' },
    { key: 'dark', bg: '#1f2937', tab: '#374151', fg: '#f8fafc' },
  ]
  return (
    <div className={`flex flex-col gap-2 ${dim ? 'opacity-50' : ''}`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {tabs.map((t) => (
          <div key={t.key} className="rounded-lg px-2 pt-2" style={{ backgroundColor: t.bg }}>
            <div
              className="flex w-44 items-center gap-2 rounded-t-md px-2.5 py-1.5 text-[11px]"
              style={{ backgroundColor: t.tab, color: t.fg }}
            >
              {small ? (
                // eslint-disable-next-line @next/next/no-img-element -- generated data URI
                <img src={svgToDataUri(small.svg)} alt="" width={16} height={16} className="h-4 w-4 shrink-0" />
              ) : null}
              <span className="truncate">{brand}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3" aria-label={strings.faviconSizes}>
        {[16, 32, 48, 180].map((size) => {
          const v = by(size)
          if (!v) return null
          const shown = size === 180 ? 64 : size
          return (
            <span key={size} className="flex flex-col items-center gap-1">
              <span className="flex items-center gap-1 rounded-md border border-border p-1.5" style={{ backgroundColor: LIGHT_SURFACE }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
                <img src={svgToDataUri(v.svg)} alt="" width={shown} height={shown} style={{ width: shown, height: shown }} />
              </span>
              <span className="text-[10px] text-muted-foreground">{size}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
