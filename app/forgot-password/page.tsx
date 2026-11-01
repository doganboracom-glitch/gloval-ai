'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { PASSWORD_RESET_COOLDOWN_SECONDS } from '@/lib/password-reset-policy'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestInFlight = useRef(false)

  const isCoolingDown = cooldownSeconds !== null && cooldownSeconds > 0

  useEffect(() => {
    if (!isCoolingDown) return
    const interval = window.setInterval(() => {
      setCooldownSeconds((remaining) =>
        remaining === null ? null : Math.max(remaining - 1, 0),
      )
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isCoolingDown])

  const message =
    cooldownSeconds === null
      ? null
      : cooldownSeconds > 0
        ? `Bağlantı gönderildi. Gelmediyse spam klasörünü kontrol et; yeni bağlantıyı ${cooldownSeconds} sn sonra isteyebilirsin.`
        : 'Bağlantı gönderildi. Gelmediyse spam klasörünü kontrol et; artık yeni bağlantı isteyebilirsin.'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestInFlight.current || (cooldownSeconds ?? 0) > 0) return

    setError(null)
    setLoading(true)
    requestInFlight.current = true

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (!response.ok) {
        setError('İstek şu anda işlenemedi. Lütfen daha sonra tekrar deneyin.')
        return
      }

      setCooldownSeconds(PASSWORD_RESET_COOLDOWN_SECONDS)
    } catch {
      setError('İstek şu anda işlenemedi. Lütfen daha sonra tekrar deneyin.')
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Şifreni sıfırla"
      subtitle="Hesabına bağlı e-posta adresini yaz; şifre yenileme bağlantısını gönderelim."
      footer={
        <>
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Giriş sayfasına dön
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">E-posta</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="h-11 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </label>
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {message && <p role="status" aria-live="polite" aria-atomic="true" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">{message}</p>}
        <Button
          type="submit"
          size="lg"
          disabled={loading || (cooldownSeconds !== null && cooldownSeconds > 0)}
          className="mt-2 w-full"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Gönderiliyor...
            </>
          ) : cooldownSeconds !== null && cooldownSeconds > 0 ? (
            `Tekrar iste (${cooldownSeconds} sn)`
          ) : (
            'Bağlantı gönder'
          )}
        </Button>
      </form>
    </AuthShell>
  )
}
