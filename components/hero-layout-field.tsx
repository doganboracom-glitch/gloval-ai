'use client'

import { useId } from 'react'
import { useLanguage } from '@/components/language-provider'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { Section } from '@/lib/website-schema'
import {
  MAX_HERO_OVERLAY,
  resolveHeroLayout,
  type HeroAlign,
  type HeroImageFit,
  type HeroLayout,
} from '@/lib/hero-layout'

type HeroData = Extract<Section, { type: 'hero' }>

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label={label}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              o.value === value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function HeroLayoutField({
  hero,
  onDispatch,
}: {
  hero: HeroData
  onDispatch: (op: EditOperation) => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const sliderId = useId()
  const settings = resolveHeroLayout(hero)

  const patch = (p: Parameters<typeof dispatchPatch>[0]) => onDispatch(dispatchPatch(p))

  const layouts: { value: HeroLayout; label: string }[] = [
    { value: 'split', label: ui.heroLayoutSplit },
    { value: 'light-cover', label: ui.heroLayoutLightCover },
    { value: 'full-bleed', label: ui.heroLayoutFullBleed },
  ]
  const aligns: { value: HeroAlign; label: string }[] = [
    { value: 'left', label: ui.heroAlignLeft },
    ...(settings.layout === 'full-bleed'
      ? [{ value: 'center' as const, label: ui.heroAlignCenter }]
      : []),
    { value: 'right', label: ui.heroAlignRight },
  ]
  const fits: { value: HeroImageFit; label: string }[] = [
    { value: 'contain', label: ui.heroImageFitContain },
    { value: 'cover', label: ui.heroImageFitCover },
  ]

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label={ui.heroLayout}
        value={settings.layout}
        options={layouts}
        onChange={(layout) => patch({ layout })}
      />
      <Segmented
        label={ui.heroAlign}
        value={settings.align}
        options={aligns}
        onChange={(align) => patch({ align })}
      />
      {settings.layout === 'light-cover' && (
        <Segmented
          label={ui.heroImageFit}
          value={settings.imageFit}
          options={fits}
          onChange={(imageFit) => patch({ imageFit })}
        />
      )}
      {settings.layout === 'light-cover' && (
        <p className="-mt-1 text-xs text-muted-foreground">{ui.heroImageFitNote}</p>
      )}
      {settings.layout === 'full-bleed' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={sliderId} className="flex justify-between text-xs text-muted-foreground">
            <span>{ui.heroOverlay}</span>
            <span className="font-mono">{settings.overlay}%</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={MAX_HERO_OVERLAY}
            step={5}
            value={settings.overlay}
            onChange={(e) => patch({ overlay: Number(e.target.value) })}
            className="w-full accent-[var(--color-brand)]"
          />
          <p className="text-xs text-muted-foreground">{ui.heroOverlayHint}</p>
        </div>
      )}
    </div>
  )
}

function dispatchPatch(patch: {
  layout?: HeroLayout
  align?: HeroAlign
  overlay?: number
  imageFit?: HeroImageFit
}): EditOperation {
  return { op: 'updateHeroLayout', patch }
}
