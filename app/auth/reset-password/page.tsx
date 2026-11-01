'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { createClient } from '@/lib/supabase/client'

type PasswordUpdateError = {
  code?: string
  message?: string
  status?: number
}

type PasswordUpdateErrorKey =
  | 'passwordSameAsCurrent'
  | 'passwordUpdateLinkError'
  | 'passwordUpdateFailed'

const RECOVERY_SESSION_ERROR_CODES = new Set([
  'bad_jwt',
  'invalid_grant',
  'invalid_jwt',
  'invalid_refresh_token',
  'invalid_token',
  'otp_expired',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_expired',
  'session_not_found',
  'token_expired',
])

const RECOVERY_SESSION_ERROR_MESSAGE =
  /(?:session|token|jwt|otp).*(?:expired|invalid|missing|not found|already used)|(?:expired|invalid|missing|not found|already used).*(?:session|token|jwt|otp)/i

function getPasswordUpdateErrorKey(error: PasswordUpdateError): PasswordUpdateErrorKey {
  const code = error.code?.toLowerCase()
  const message = error.message ?? ''

  if (code === 'same_password' || /different from the old password/i.test(message)) {
    return 'passwordSameAsCurrent'
  }

  if (
    error.status === 401 ||
    RECOVERY_SESSION_ERROR_CODES.has(code ?? '') ||
    RECOVERY_SESSION_ERROR_MESSAGE.test(`${code ?? ''} ${message}`)
  ) {
    return 'passwordUpdateLinkError'
  }

  return 'passwordUpdateFailed'
}

export default function ResetPasswordPage() {
  const { t } = useLanguage()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let active = true
    createClient().auth.getSession().then(({ data }) => {
      if (active) {
        setReady(Boolean(data.session))
        if (!data.session) setError(t.auth.recoveryLinkInvalid)
      }
    })
    return () => {
      active = false
    }
  }, [t.auth.recoveryLinkInvalid])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (password.length < 8) return setError('Şifre en az 8 karakter olmalı.')
    if (password !== confirmation) return setError('Şifreler eşleşmiyor.')
    setPending(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setPending(false)
    if (updateError) {
      setError(t.auth[getPasswordUpdateErrorKey(updateError)])
      return
    }
    setMessage('Şifreniz başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsunuz.')
    window.setTimeout(() => window.location.assign('/auth/login'), 1200)
  }

  return (
    <AuthShell
      title="Yeni şifre belirle"
      subtitle="Hesabın için yeni ve güvenli bir şifre oluştur."
      footer={
        <Link href="/auth/login" className="font-medium text-primary hover:underline">
          Giriş sayfasına dön
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Yeni şifre</span>
          <input autoComplete="new-password" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Yeni şifre tekrar</span>
          <input autoComplete="new-password" type="password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-11 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
        </label>
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">{message}</p>}
        <Button type="submit" size="lg" disabled={!ready || pending} className="mt-2 w-full">
          {pending ? <><Loader2 className="size-4 animate-spin" /> Güncelleniyor...</> : 'Şifreyi güncelle'}
        </Button>
      </form>
    </AuthShell>
  )
}
