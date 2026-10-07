'use client'

import { useId, useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PasswordCopy } from '@/components/mail/password-copy'
import {
  PASSWORD_MAX_LENGTH,
  checkPasswordRules,
  generateStrongPassword,
} from '@/lib/mail/password'

type Props = {
  copy: PasswordCopy
  password: string
  confirm: string
  onChange: (next: { password: string; confirm: string }) => void
  labels: { password: string; confirm: string }
  autoFocus?: boolean
}

/**
 * Password + confirmation inputs with show/hide toggles, a live rule checklist
 * and an optional client-side suggestion. Values live only in the parent's
 * state and are submitted through a server action, never a URL or storage.
 */
export function PasswordFields({ copy, password, confirm, onChange, labels, autoFocus }: Props) {
  const baseId = useId()
  const [revealPassword, setRevealPassword] = useState(false)
  const [revealConfirm, setRevealConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  const rules = checkPasswordRules(password, confirm)
  const showMismatch = confirm.length > 0 && password !== confirm

  function suggest() {
    const next = generateStrongPassword()
    onChange({ password: next, confirm: next })
    setRevealPassword(true)
    setRevealConfirm(true)
    setCopied(false)
  }

  const items: Array<{ ok: boolean; label: string }> = [
    { ok: rules.minLength, label: copy.ruleMinLength },
    { ok: rules.hasLetter, label: copy.ruleLetter },
    { ok: rules.hasDigit, label: copy.ruleDigit },
    { ok: rules.matches, label: copy.ruleMatch },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${baseId}-pw`} className="text-sm font-medium">
          {labels.password}
        </label>
        <div className="flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
          <input
            id={`${baseId}-pw`}
            type={revealPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setCopied(false)
              onChange({ password: e.target.value, confirm })
            }}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={PASSWORD_MAX_LENGTH}
            autoFocus={autoFocus}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
          {revealPassword && password && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(password)
                setCopied(true)
              }}
              className="px-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={copy.copy}
              title={copy.copy}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setRevealPassword((v) => !v)}
            className="px-3 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={revealPassword ? copy.hide : copy.show}
            aria-pressed={revealPassword}
          >
            {revealPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${baseId}-pw2`} className="text-sm font-medium">
          {labels.confirm}
        </label>
        <div
          className={`flex items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring ${
            showMismatch ? 'border-destructive/60' : 'border-border'
          }`}
        >
          <input
            id={`${baseId}-pw2`}
            type={revealConfirm ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => onChange({ password, confirm: e.target.value })}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={PASSWORD_MAX_LENGTH}
            aria-invalid={showMismatch}
            aria-describedby={showMismatch ? `${baseId}-mismatch` : undefined}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setRevealConfirm((v) => !v)}
            className="px-3 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={revealConfirm ? copy.hide : copy.show}
            aria-pressed={revealConfirm}
          >
            {revealConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {showMismatch && (
          <span id={`${baseId}-mismatch`} role="alert" className="text-xs text-destructive">
            {copy.mismatch}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1" aria-live="polite">
        {items.map((item) => (
          <li
            key={item.label}
            className={`flex items-center gap-2 text-xs ${
              item.ok ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {item.ok ? (
              <Check className="size-3.5 text-primary" aria-hidden />
            ) : (
              <X className="size-3.5" aria-hidden />
            )}
            {item.label}
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={suggest} className="gap-2 self-start">
        <KeyRound className="size-3.5" />
        {copy.suggest}
      </Button>
    </div>
  )
}
