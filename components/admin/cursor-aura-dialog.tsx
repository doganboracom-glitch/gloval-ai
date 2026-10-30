'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getSiteCursorAura, setSiteCursorAura } from '@/lib/admin/actions'
import {
  CURSOR_AURA_HEX,
  CURSOR_AURA_LIMITS,
  CURSOR_AURA_PRESET_COLORS,
  DEFAULT_CURSOR_AURA,
  type CursorAuraConfig,
} from '@/lib/cursor-aura'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'

/** Admin-only editor for a site's cursor aura effect (flag, colours, intensity, size). */
export function CursorAuraDialog({
  site,
  onClose,
}: {
  site: { id: string; name: string } | null
  onClose: () => void
}) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [config, setConfig] = useState<CursorAuraConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const siteId = site?.id ?? null
  useEffect(() => {
    if (!siteId) return
    let cancelled = false
    setConfig(null)
    setError(null)
    getSiteCursorAura(siteId).then((res) => {
      if (cancelled) return
      if (res.ok) setConfig(res.config)
      else setError(t.sites.auraFailed)
    })
    return () => {
      cancelled = true
    }
  }, [siteId, t.sites.auraFailed])

  const colorsValid = config ? config.colors.every((c) => CURSOR_AURA_HEX.test(c)) : false

  function toggleColor(color: string) {
    if (!config) return
    const has = config.colors.includes(color)
    const colors = has ? config.colors.filter((c) => c !== color) : [...config.colors, color]
    if (colors.length < CURSOR_AURA_LIMITS.colors.min || colors.length > CURSOR_AURA_LIMITS.colors.max) return
    setConfig({ ...config, colors })
  }

  function save() {
    if (!site || !config) return
    startTransition(async () => {
      const res = await setSiteCursorAura(site.id, config)
      if (!res.ok) {
        setError(t.sites.auraFailed)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <ConfirmDialog
      open={site !== null}
      title={`${t.sites.auraTitle}${site ? ` — ${site.name}` : ''}`}
      description={t.sites.auraDescription}
      confirmLabel={t.sites.auraSave}
      cancelLabel={t.common.cancel}
      confirmDisabled={pending || !config || !colorsValid}
      onConfirm={save}
      onCancel={onClose}
    >
      <div className="mt-4 flex flex-col gap-4 text-sm">
        {!config && !error && <p className="text-muted-foreground">{t.sites.auraLoading}</p>}
        {config && (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="size-4 accent-[var(--color-brand)]"
              />
              <span className="font-medium">{t.sites.auraEnabled}</span>
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-medium">{t.sites.auraColors}</legend>
              <div className="flex flex-wrap gap-2">
                {CURSOR_AURA_PRESET_COLORS.map((color) => {
                  const selected = config.colors.includes(color)
                  return (
                    <button
                      key={color}
                      type="button"
                      aria-pressed={selected}
                      aria-label={color}
                      onClick={() => toggleColor(color)}
                      style={{ backgroundColor: color }}
                      className={
                        'size-8 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ' +
                        (selected ? 'scale-110 border-foreground' : 'border-transparent opacity-50')
                      }
                    />
                  )
                })}
              </div>
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">
                {t.sites.auraIntensity}: {config.intensity.toFixed(2)}
              </span>
              <input
                type="range"
                min={CURSOR_AURA_LIMITS.intensity.min}
                max={CURSOR_AURA_LIMITS.intensity.max}
                step={0.05}
                value={config.intensity}
                onChange={(e) => setConfig({ ...config, intensity: Number(e.target.value) })}
                className="accent-[var(--color-brand)]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">
                {t.sites.auraSize}: {config.size}
              </span>
              <input
                type="range"
                min={CURSOR_AURA_LIMITS.size.min}
                max={CURSOR_AURA_LIMITS.size.max}
                step={10}
                value={config.size}
                onChange={(e) => setConfig({ ...config, size: Number(e.target.value) })}
                className="accent-[var(--color-brand)]"
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  )
}

export { DEFAULT_CURSOR_AURA }
