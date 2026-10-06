'use client'

import { useRef, useState } from 'react'

/**
 * Shared editor primitives
 * ------------------------
 * Extracted so both the editor panel and the section inspector use the exact
 * same input behaviour: a local draft keeps typing smooth and the change is
 * committed (and captured by undo/redo) on blur / Enter, not per keystroke.
 * When the value changes externally (undo/redo, AI edit, image generation) and
 * the field is not being edited, it resyncs.
 */
export function TextField({
  label,
  value,
  onCommit,
  multiline = false,
  placeholder,
  rows = 3,
  hint,
  mono = false,
}: {
  label: string
  value: string
  onCommit: (value: string) => void
  multiline?: boolean
  placeholder?: string
  rows?: number
  /** Optional helper text rendered under the field. */
  hint?: string
  /** Renders the value in a monospaced font (used for code snippets). */
  mono?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const dirtyRef = useRef(false)
  if (!dirtyRef.current && draft !== value) setDraft(value)

  function commit() {
    dirtyRef.current = false
    if (draft !== value) onCommit(draft)
  }

  const className = `w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary placeholder:text-muted-foreground${
    mono ? ' font-mono text-xs leading-relaxed' : ''
  }`

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          rows={rows}
          value={draft}
          placeholder={placeholder}
          spellCheck={mono ? false : undefined}
          onChange={(e) => {
            dirtyRef.current = true
            setDraft(e.target.value)
          }}
          onBlur={commit}
          className={`${className} ${mono ? 'resize-y' : 'resize-none'}`}
        />
      ) : (
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
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
          className={className}
        />
      )}
      {hint ? <span className="text-[11px] leading-snug text-muted-foreground/80">{hint}</span> : null}
    </label>
  )
}

export function IconBtn({
  label,
  onClick,
  disabled = false,
  small = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  small?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent ${
        small ? 'h-7 w-7' : 'h-8 w-8'
      }`}
    >
      {children}
    </button>
  )
}

/** A compact outlined action button used for inline editor actions. */
export function GhostButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
    >
      {children}
    </button>
  )
}

/**
 * A hidden file input plus its trigger button, used everywhere the user uploads
 * their own image. The file is read as a data URI so the change flows through
 * the same schema operations (and therefore undo/redo) as any other edit.
 */
export function UploadButton({
  label,
  onFile,
  icon,
}: {
  label: string
  onFile: (dataUri: string) => void
  icon?: React.ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <GhostButton onClick={() => ref.current?.click()}>
        {icon}
        {label}
      </GhostButton>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            if (result) onFile(result)
          }
          reader.readAsDataURL(file)
        }}
      />
    </>
  )
}
