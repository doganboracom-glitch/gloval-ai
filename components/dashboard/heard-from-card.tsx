'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { HEARD_FROM_VALUES, type HeardFromValue } from '@/lib/heard-from'
import { saveHeardFrom } from '@/lib/heard-from-actions'

// Functional "not now" flag only; it is unrelated to the banner or any marketing state.
const SKIP_STORAGE_KEY = 'gloval:heard-from-skipped'

type Phase = 'checking' | 'asking' | 'saved' | 'hidden'

export function HeardFromCard() {
  const { t } = useLanguage()
  const copy = t.dash.heardFrom
  const groupId = useId()
  const [phase, setPhase] = useState<Phase>('checking')
  const [selected, setSelected] = useState<HeardFromValue | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let skipped = false
    try {
      skipped = window.localStorage.getItem(SKIP_STORAGE_KEY) === '1'
    } catch {
      // Storage may be unavailable; the question is simply shown.
    }
    setPhase(skipped ? 'hidden' : 'asking')
  }, [])

  useEffect(() => {
    if (phase !== 'saved') return
    const timer = window.setTimeout(() => setPhase('hidden'), 3000)
    return () => window.clearTimeout(timer)
  }, [phase])

  function skip() {
    try {
      window.localStorage.setItem(SKIP_STORAGE_KEY, '1')
    } catch {
      // Ignore: the card just hides for this visit.
    }
    setPhase('hidden')
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || pending) return
    setFailed(false)
    startTransition(async () => {
      try {
        const result = await saveHeardFrom(selected)
        if (result.ok) setPhase('saved')
        else setFailed(true)
      } catch {
        setFailed(true)
      }
    })
  }

  if (phase === 'checking' || phase === 'hidden') return null

  if (phase === 'saved') {
    return (
      <p role="status" className="mt-6 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
        {copy.thanks}
      </p>
    )
  }

  return (
    <form
      onSubmit={submit}
      aria-describedby={`${groupId}-hint`}
      className="mt-6 rounded-xl border border-border bg-card px-4 py-4 sm:px-5"
    >
      <fieldset className="min-w-0">
        <legend className="text-sm font-semibold text-foreground">{copy.title}</legend>
        <p id={`${groupId}-hint`} className="mt-1 text-sm text-muted-foreground">
          {copy.hint}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {HEARD_FROM_VALUES.map((value) => {
            const inputId = `${groupId}-${value}`
            return (
              <div key={value}>
                <input
                  id={inputId}
                  type="radio"
                  name={groupId}
                  value={value}
                  checked={selected === value}
                  onChange={() => setSelected(value)}
                  className="peer sr-only"
                />
                <label
                  htmlFor={inputId}
                  className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-border bg-background px-3.5 text-sm text-foreground transition-colors hover:bg-muted peer-checked:border-brand peer-checked:bg-brand/10 peer-checked:font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand"
                >
                  {copy[value]}
                </label>
              </div>
            )
          })}
        </div>
      </fieldset>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {copy.error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!selected || pending}>
          {pending ? copy.saving : copy.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={skip} disabled={pending}>
          {copy.skip}
        </Button>
      </div>
    </form>
  )
}
