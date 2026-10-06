'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlignCenter, AlignLeft, AlignRight, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { resolveTheme } from '@/components/website-renderer/theme'
import { buildLogoMark, scaleLogoUpload, fitLogoToCanvas, LOGO_VARIANT_COUNT } from '@/lib/logo-mark'
import { GhostButton, IconBtn } from '@/components/editor/editor-fields'
import { classifyLogoGenerateStatus } from '@/lib/logo-generate-status'
import { peekPendingProject } from '@/lib/pending-project'
import { sanitizeNextPath } from '@/lib/safe-redirect'

/** 2 MB — matches the size warning shown to the owner. */
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']

type Align = 'left' | 'center' | 'right'

/**
 * LogoField
 * ---------
 * The brand-mark control in the editor's "Menu and buttons" group:
 *
 *  - "Suggest a new logo" cycles through deterministic, locally built SVG marks
 *    drawn from the brand initials + the site's own palette. No AI request is
 *    made, so refreshing a logo costs ZERO credits.
 *  - "Upload my own logo" reads the file, validates its type/size, and
 *    auto-scales it into the recommended box before it reaches the schema.
 *    Any aspect ratio (horizontal, square, vertical) is accepted as-is — the
 *    file is never force-cropped into a square, that's the favicon's job.
 *  - "Generate with AI" calls `/api/logo-image` for real, on-brand logo
 *    alternatives (uses the site's own palette) and lets the owner preview
 *    and pick one before it ever touches the schema. This is a REAL, paid AI
 *    action — costs are enforced server-side (see the route), never here.
 *  - Width / height / mobile width / alignment give the owner direct control
 *    over how the mark sits in the header, independent of `src`.
 *
 * Like every other editor control it owns no schema state: each change is
 * emitted as an `updateNavLogo` operation, so undo/redo and autosave keep
 * working untouched.
 */
export function LogoField({
  site,
  onDispatch,
  onBeforeUpgrade,
}: {
  site: WebsiteSchema
  onDispatch: (op: EditOperation) => void
  /** Saves/stashes the draft before an anonymous visitor leaves for login. */
  onBeforeUpgrade?: () => Promise<boolean>
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loginRequired, setLoginRequired] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [alternatives, setAlternatives] = useState<string[]>([])

  const logo = site.navigation.logo
  const theme = resolveTheme(site)

  function regenerate() {
    setError(null)
    const nextVariant =
      logo?.source === 'generated' && typeof logo.variant === 'number'
        ? (logo.variant + 1) % LOGO_VARIANT_COUNT
        : 0
    const src = buildLogoMark({
      name: site.navigation.logoText || site.meta.name,
      primary: theme.primary,
      accent: theme.accent,
      variant: nextVariant,
    })
    onDispatch({ op: 'updateNavLogo', src, variant: nextVariant, source: 'generated' })
  }

  async function handleFile(file: File) {
    setError(null)
    if (!ALLOWED.includes(file.type)) {
      setError(ui.logoBadType)
      return
    }
    if (file.size > MAX_BYTES) {
      setError(ui.logoTooLarge)
      return
    }
    setBusy(true)
    try {
      const dataUri = await readAsDataUri(file)
      // Auto-scale into the recommended box (preserving aspect ratio) so the
      // stored schema stays small — the owner's original crop is untouched.
      const scaled = await scaleLogoUpload(dataUri)
      onDispatch({ op: 'updateNavLogo', src: scaled, source: 'upload' })
    } catch {
      setError(ui.logoBadType)
    } finally {
      setBusy(false)
    }
  }

  async function generateWithAi() {
    setGenError(null)
    setLoginRequired(false)
    setGenerating(true)
    setAlternatives([])
    try {
      const res = await fetch('/api/logo-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: site,
          companyName: site.navigation.logoText || site.meta.name,
          format: 'horizontal',
          count: 3,
        }),
      })
      if (!res.ok) {
        const kind = classifyLogoGenerateStatus(res.status)
        if (kind === 'auth') setLoginRequired(true)
        else if (kind === 'credits') setGenError(ui.logoGenerateOutOfCredits)
        else if (kind === 'dailyLimit') setGenError(ui.logoGenerateDailyLimit)
        else setGenError(ui.logoGenerateFailed)
        return
      }
      const data = (await res.json()) as { alternatives?: { src: string }[] }
      const srcs = (data.alternatives ?? []).map((a) => a.src).filter(Boolean)
      if (srcs.length === 0) {
        setGenError(ui.logoGenerateFailed)
        return
      }
      setAlternatives(srcs)
    } catch {
      setGenError(ui.logoGenerateFailed)
    } finally {
      setGenerating(false)
    }
  }

  async function goToAuth(page: 'login' | 'sign-up') {
    if (leaving) return
    setLeaving(true)
    setGenError(null)
    try {
      const saved = onBeforeUpgrade ? await onBeforeUpgrade() : true
      if (!saved) {
        setGenError(ui.logoLoginSaveFailed)
        return
      }
      // An anonymous draft is stashed for the dashboard to turn into a real
      // project; a saved project returns to the exact editor URL instead.
      const next = peekPendingProject()
        ? '/dashboard'
        : sanitizeNextPath(`${window.location.pathname}${window.location.search}`)
      router.push(`/auth/${page}?next=${encodeURIComponent(next)}`)
    } finally {
      setLeaving(false)
    }
  }

  async function applyAlternative(src: string) {
    setGenError(null)
    try {
      const fitted = await fitLogoToCanvas(src)
      setAlternatives([])
      onDispatch({ op: 'updateNavLogo', src: fitted, source: 'ai' })
    } catch (err) {
      console.log('[v0] logo fit failed:', err instanceof Error ? err.message : err)
      setGenError(ui.logoGenerateFailed)
    }
  }

  const align: Align = logo?.align ?? 'left'

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{ui.logoMark}</span>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border"
          style={{ backgroundColor: theme.background }}
        >
          {logo?.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI preview
            <img
              src={logo.src || '/placeholder.svg'}
              alt={site.navigation.logoText}
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span className="text-[10px] leading-tight text-muted-foreground">—</span>
          )}
        </div>
        <p className="flex-1 text-[11px] leading-snug text-muted-foreground">
          {logo?.source === 'upload'
            ? ui.logoUploadedNote
            : logo?.source === 'ai'
              ? ui.logoUploadedNote
              : logo
                ? ''
                : ui.logoNone}
        </p>
        {logo ? (
          <IconBtn
            label={ui.logoRemove}
            small
            onClick={() => {
              setError(null)
              onDispatch({ op: 'updateNavLogo', src: null })
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <GhostButton onClick={regenerate} disabled={busy || generating}>
          <RefreshCw className="h-3.5 w-3.5" />
          {ui.logoRegenerate}
        </GhostButton>
        <GhostButton onClick={() => inputRef.current?.click()} disabled={busy || generating}>
          <Upload className="h-3.5 w-3.5" />
          {ui.logoUpload}
        </GhostButton>
      </div>

      <GhostButton onClick={generateWithAi} disabled={busy || generating}>
        <Sparkles className="h-3.5 w-3.5" />
        {generating ? ui.logoGenerating : ui.logoGenerateAi}
      </GhostButton>

      {loginRequired ? (
        <div
          role="alert"
          className="flex flex-col gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2"
        >
          <p className="text-[11px] leading-snug text-foreground">{ui.logoLoginRequired}</p>
          <div className="grid grid-cols-2 gap-1.5">
            <GhostButton onClick={() => void goToAuth('login')} disabled={leaving}>
              {ui.logoLoginCta}
            </GhostButton>
            <GhostButton onClick={() => void goToAuth('sign-up')} disabled={leaving}>
              {ui.logoSignUpCta}
            </GhostButton>
          </div>
        </div>
      ) : null}

      {genError ? (
        <p role="alert" className="text-[11px] leading-snug text-destructive">
          {genError}
        </p>
      ) : null}

      {alternatives.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2">
          <span className="text-[11px] leading-snug text-muted-foreground">
            {ui.logoChooseAlternative}
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {alternatives.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyAlternative(src)}
                title={ui.logoApplyAlternative}
                className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border p-1.5 transition-colors hover:border-primary"
                style={{ backgroundColor: theme.background }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI preview */}
                <img src={src || '/placeholder.svg'} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />

      {logo?.src ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2">
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField
              label={ui.logoWidth}
              value={logo.width}
              onCommit={(v) => onDispatch({ op: 'updateNavLogo', width: v })}
            />
            <NumberField
              label={ui.logoHeight}
              value={logo.height}
              onCommit={(v) => onDispatch({ op: 'updateNavLogo', height: v })}
            />
            <NumberField
              label={ui.logoMobileWidth}
              value={logo.mobileWidth}
              onCommit={(v) => onDispatch({ op: 'updateNavLogo', mobileWidth: v })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{ui.logoAlign}</span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['left', AlignLeft, ui.logoAlignLeft],
                  ['center', AlignCenter, ui.logoAlignCenter],
                  ['right', AlignRight, ui.logoAlignRight],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onDispatch({ op: 'updateNavLogo', align: value })}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-medium transition-colors ${
                    align === value
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <GhostButton
            onClick={() =>
              onDispatch({ op: 'updateNavLogo', width: null, height: null, mobileWidth: null, align: 'left' })
            }
          >
            {ui.logoResetSize}
          </GhostButton>
        </div>
      ) : null}

      <p className="text-[11px] leading-snug text-muted-foreground/80">{ui.logoSizeHint}</p>
      {error ? (
        <p role="alert" className="text-[11px] leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** A compact numeric input that commits on blur/Enter, matching `TextField`'s draft behaviour. */
function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number | undefined
  onCommit: (value: number | null) => void
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : '')
  const dirtyRef = useRef(false)
  const external = value != null ? String(value) : ''
  if (!dirtyRef.current && draft !== external) setDraft(external)

  function commit() {
    dirtyRef.current = false
    const parsed = draft.trim() === '' ? null : Math.round(Number(draft))
    const next = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null
    if (next !== value) onCommit(next)
    setDraft(next != null ? String(next) : '')
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] leading-snug text-muted-foreground">{label}</span>
      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          dirtyRef.current = true
          setDraft(e.target.value)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none transition-colors focus:border-primary"
      />
    </label>
  )
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (result) resolve(result)
      else reject(new Error('empty'))
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}
