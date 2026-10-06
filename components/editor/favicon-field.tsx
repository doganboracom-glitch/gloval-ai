'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { GhostButton, IconBtn } from '@/components/editor/editor-fields'

/** 1 MB — favicons are tiny by nature, so the limit is tighter than the header logo's. */
const MAX_BYTES = 1 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']

/**
 * FaviconField
 * ------------
 * The browser-tab icon, managed entirely separately from the header logo
 * (`LogoField`) — see `faviconSchema` in `lib/website-schema.ts`. A wide
 * horizontal header wordmark is never auto-cropped into a favicon; the owner
 * uploads their own square glyph, or reuses the header logo only when it is
 * already square-ish (own choice, not automatic).
 *
 * Like every other editor control it owns no schema state: each change is
 * emitted as an `updateFavicon` operation, so undo/redo and autosave keep
 * working untouched.
 */
export function FaviconField({
  site,
  onDispatch,
}: {
  site: WebsiteSchema
  onDispatch: (op: EditOperation) => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const favicon = site.navigation.favicon
  const logo = site.navigation.logo

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
      onDispatch({ op: 'updateFavicon', src: dataUri })
    } catch {
      setError(ui.logoBadType)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{ui.faviconMark}</span>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
          {favicon?.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI preview
            <img src={favicon.src || '/placeholder.svg'} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <p className="flex-1 text-[11px] leading-snug text-muted-foreground">
          {favicon?.src ? '' : ui.faviconNone}
        </p>
        {favicon?.src ? (
          <IconBtn
            label={ui.faviconRemove}
            small
            onClick={() => {
              setError(null)
              onDispatch({ op: 'updateFavicon', src: null })
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <GhostButton onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload className="h-3.5 w-3.5" />
          {ui.faviconUpload}
        </GhostButton>
        <GhostButton onClick={() => onDispatch({ op: 'updateFavicon', src: logo?.src ?? null })} disabled={busy || !logo?.src}>
          <ImageIcon className="h-3.5 w-3.5" />
          {ui.faviconUseLogo}
        </GhostButton>
      </div>

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

      <p className="text-[11px] leading-snug text-muted-foreground/80">{ui.faviconHint}</p>
      {error ? (
        <p role="alert" className="text-[11px] leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </div>
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
