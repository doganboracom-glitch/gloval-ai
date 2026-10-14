'use client'

import { useState, useTransition } from 'react'
import { resolveMapInputAction, type MapInputResult } from '@/lib/map-embed-actions'
import { mapCopy } from '@/lib/map-embed-copy'

const ERROR_KEY = {
  invalid: 'invalid',
  unsafe: 'unsafe',
  'wrong-domain': 'wrongDomain',
  'unsupported-link': 'unsupportedLink',
  'short-link': 'shortLink',
  unauthorized: 'unauthorized',
} as const

/**
 * Editor control for the contact section's Google map. The owner pastes the
 * "Embed a map" iframe (or a maps link); the server validates it and only the
 * clean embed URL is stored.
 */
export function MapEmbedField({
  value,
  lang,
  onCommit,
}: {
  value: string
  lang: string
  onCommit: (src: string) => void
}) {
  const copy = mapCopy(lang)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!draft.trim()) return
    setError(null)
    startTransition(async () => {
      let result: MapInputResult
      try {
        result = await resolveMapInputAction(draft)
      } catch {
        setError(copy.errors.generic)
        return
      }
      if (result.ok) {
        onCommit(result.src)
        setDraft('')
      } else {
        setError(copy.errors[ERROR_KEY[result.error]])
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{copy.fieldLabel}</span>

      {value && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
          <span className="text-xs font-medium">{copy.connected}</span>
          <button
            type="button"
            onClick={() => onCommit('')}
            className="text-xs font-medium text-destructive hover:underline"
          >
            {copy.remove}
          </button>
        </div>
      )}

      <textarea
        rows={3}
        value={draft}
        placeholder={copy.fieldPlaceholder}
        onChange={(e) => setDraft(e.target.value)}
        aria-invalid={error ? true : undefined}
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
      />

      {error && (
        <p role="alert" className="text-xs leading-snug text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !draft.trim()}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? copy.adding : copy.add}
      </button>

      <div className="rounded-lg border border-border bg-secondary/30 p-3">
        <p className="text-xs font-semibold">{copy.stepsTitle}</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-snug text-muted-foreground">
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-2 break-all font-mono text-[10px] leading-snug text-muted-foreground/80">
          {copy.example}
        </p>
      </div>
    </div>
  )
}
