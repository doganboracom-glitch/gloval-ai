'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { getMyCursorAura, setMyCursorAura } from '@/lib/aura-cursor-owner'
import {
  CURSOR_AURA_PRESET_COLORS,
  DEFAULT_CURSOR_AURA,
  OWNER_CURSOR_AURA_LIMITS,
  clampToOwnerLimits,
  type CursorAuraConfig,
} from '@/lib/cursor-aura'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useLanguage } from '@/components/language-provider'

/** Owner editor for a site's cursor aura. Bounds mirror the server-side owner limits. */
export function CursorAuraOwnerDialog({
  site,
  onClose,
}: {
  site: { id: string; name: string; locked?: boolean } | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const copy = t.dash.cursorAura
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [config, setConfig] = useState<CursorAuraConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const siteId = site?.id ?? null
  const locked = site?.locked === true
  useEffect(() => {
    if (!siteId) return
    let cancelled = false
    setError(null)
    if (locked) {
      // No right: show the controls disabled, never read or write the site's effect.
      setConfig(clampToOwnerLimits(DEFAULT_CURSOR_AURA))
      return
    }
    setConfig(null)
    getMyCursorAura(siteId).then((res) => {
      if (cancelled) return
      if (res.ok) setConfig(res.config)
      else setError(res.error === 'not_entitled' ? copy.notEntitled : copy.failed)
    })
    return () => {
      cancelled = true
    }
  }, [siteId, locked, copy.failed, copy.notEntitled])

  function toggleColor(color: string) {
    if (!config) return
    const has = config.colors.includes(color)
    const colors = has ? config.colors.filter((c) => c !== color) : [...config.colors, color]
    if (colors.length < OWNER_CURSOR_AURA_LIMITS.colors.min || colors.length > OWNER_CURSOR_AURA_LIMITS.colors.max) return
    setConfig({ ...config, colors })
  }

  function save() {
    if (!site || !config) return
    if (locked) {
      router.push('/billing?addon=aura_cursor')
      return
    }
    startTransition(async () => {
      const res = await setMyCursorAura(site.id, config)
      if (!res.ok) {
        setError(res.error === 'not_entitled' ? copy.notEntitled : copy.failed)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <ConfirmDialog
      open={site !== null}
      title={`${copy.title}${site ? ` - ${site.name}` : ''}`}
      description={copy.description}
      confirmLabel={locked ? copy.buy : copy.save}
      cancelLabel={copy.cancel}
      confirmDisabled={pending || !config}
      onConfirm={save}
      onCancel={onClose}
    >
      <div className="mt-4 flex flex-col gap-4 text-sm">
        {locked && (
          <p role="status" className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden />
            {copy.locked}
          </p>
        )}
        {!config && !error && <p className="text-muted-foreground">{copy.loading}</p>}
        {config && (
          <fieldset disabled={locked} className={'flex flex-col gap-4 border-0 p-0' + (locked ? ' opacity-60' : '')}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="size-4 accent-[var(--color-brand)]"
              />
              <span className="font-medium">{copy.enabled}</span>
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-medium">{copy.colors}</legend>
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
                {copy.intensity}: {config.intensity.toFixed(2)}
              </span>
              <input
                type="range"
                min={OWNER_CURSOR_AURA_LIMITS.intensity.min}
                max={OWNER_CURSOR_AURA_LIMITS.intensity.max}
                step={0.05}
                value={config.intensity}
                onChange={(e) => setConfig({ ...config, intensity: Number(e.target.value) })}
                className="accent-[var(--color-brand)]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">
                {copy.size}: {config.size}
              </span>
              <input
                type="range"
                min={OWNER_CURSOR_AURA_LIMITS.size.min}
                max={OWNER_CURSOR_AURA_LIMITS.size.max}
                step={10}
                value={config.size}
                onChange={(e) => setConfig({ ...config, size: Number(e.target.value) })}
                className="accent-[var(--color-brand)]"
              />
            </label>
          </fieldset>
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
