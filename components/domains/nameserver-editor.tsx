'use client'

import { useId, useRef, useState } from 'react'
import { Globe, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { fill } from '@/components/domains/domain-chrome'
import { normalizeNameserver } from '@/lib/custom-domains/registrar/nameserver-validation'
import { cn } from '@/lib/utils'

export const MIN_NAMESERVER_ROWS = 2
export const MAX_NAMESERVER_ROWS = 13

type RowError = 'invalid' | 'duplicate' | null

/** Per-row validation using the server-side rules; empty rows are ignored. */
export function validateNameserverRows(rows: string[]): { errors: RowError[]; valid: string[]; filled: number } {
  const seen = new Set<string>()
  const valid: string[] = []
  let filled = 0
  const errors = rows.map((raw): RowError => {
    const value = raw.trim()
    if (!value) return null
    filled += 1
    const normalized = normalizeNameserver(value)
    if (!normalized) return 'invalid'
    if (seen.has(normalized)) return 'duplicate'
    seen.add(normalized)
    valid.push(normalized)
    return null
  })
  return { errors, valid, filled }
}

function initialRows(current: string[]): string[] {
  const rows = current.slice(0, MAX_NAMESERVER_ROWS).map((value) => value.toLowerCase())
  while (rows.length < MIN_NAMESERVER_ROWS) rows.push('')
  return rows
}

export function NameserverEditor({
  current,
  disabled,
  onCancel,
  onSubmit,
}: {
  current: string[]
  disabled: boolean
  onCancel: () => void
  onSubmit: (nameservers: string[]) => void
}) {
  const { t } = useLanguage()
  const d = t.domains
  const baseId = useId()
  // Stable keys so deleting a middle row does not shuffle the inputs' focus/values.
  const nextKey = useRef(0)
  const [rows, setRows] = useState(() =>
    initialRows(current).map((value) => ({ key: nextKey.current++, value })),
  )
  const [touched, setTouched] = useState<Set<number>>(() => new Set())
  const inputRefs = useRef(new Map<number, HTMLInputElement>())

  const { errors, valid, filled } = validateNameserverRows(rows.map((row) => row.value))
  const hasRowError = errors.some(Boolean)
  const canSave = !hasRowError && filled >= MIN_NAMESERVER_ROWS && valid.length >= MIN_NAMESERVER_ROWS
  const canRemove = rows.length > MIN_NAMESERVER_ROWS
  const canAdd = rows.length < MAX_NAMESERVER_ROWS

  function update(key: number, value: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, value: value.toLowerCase() } : row)))
  }

  function addRow() {
    if (!canAdd) return
    const key = nextKey.current++
    setRows((prev) => [...prev, { key, value: '' }])
    requestAnimationFrame(() => inputRefs.current.get(key)?.focus())
  }

  function removeRow(key: number) {
    if (!canRemove) return
    setRows((prev) => prev.filter((row) => row.key !== key))
    inputRefs.current.delete(key)
  }

  function errorText(error: RowError) {
    return error === 'duplicate' ? d.mgNsErrDuplicate : d.mgNsErrInvalid
  }

  const showMinError = filled < MIN_NAMESERVER_ROWS && touched.size > 0

  return (
    <form
      className="mt-3 flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave && !disabled) onSubmit(valid)
      }}
    >
      <p className="text-pretty text-xs text-muted-foreground">{d.mgNsHelp}</p>

      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const error = touched.has(row.key) ? errors[index] : null
          const label = fill(d.mgNsRowLabel, { n: index + 1 })
          const errorId = `${baseId}-err-${row.key}`
          return (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-ring',
                    error ? 'border-destructive' : 'border-border',
                  )}
                >
                  <Globe aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={(node) => {
                      if (node) inputRefs.current.set(row.key, node)
                    }}
                    type="text"
                    inputMode="url"
                    value={row.value}
                    disabled={disabled}
                    placeholder="ns.example.com"
                    aria-label={label}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    onChange={(event) => update(row.key, event.target.value)}
                    onBlur={() => setTouched((prev) => new Set(prev).add(row.key))}
                    className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm outline-none disabled:opacity-60"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || !canRemove}
                  aria-label={fill(d.mgNsRemoveRow, { n: index + 1 })}
                  onClick={() => removeRow(row.key)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {error && (
                <p id={errorId} role="alert" className="text-xs text-destructive">
                  {errorText(error)}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {showMinError && !hasRowError && (
        <p role="alert" className="text-xs text-destructive">
          {d.mgNsErrMin}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !canAdd}
        onClick={addRow}
        className="w-full border-dashed"
      >
        <Plus data-icon="inline-start" aria-hidden="true" />
        {d.mgNsAddRow}
      </Button>

      <div
        role="note"
        className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-1">
          <p>{d.mgNsDnsDelay}</p>
          <p className="font-semibold">{d.mgNsDanger}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onCancel}>
          {d.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={disabled || !canSave}>
          {d.mgNsSave}
        </Button>
      </div>
    </form>
  )
}
