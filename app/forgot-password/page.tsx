'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    setLoading(true)

    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => null)

    setLoading(false)
    if (!response?.ok) {
      setError('İstek şu anda işlenemedi. Lütfen daha sonra tekrar deneyin.')
      return
    }

    const result = await response.json().catch(() => null)
    setMessage(result?.message ?? 'Bu adres kayıtlıysa, şifre yenileme bağlantısı gönderildi. Gelen kutunuzu kontrol edin.')
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
        {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">{message}</p>}
        <Button type="submit" size="lg" disabled={loading} className="mt-2 w-full">
          {loading ? <><Loader2 className="size-4 animate-spin" /> Gönderiliyor...</> : 'Bağlantı gönder'}
        </Button>
      </form>
    </AuthShell>
  )
}
