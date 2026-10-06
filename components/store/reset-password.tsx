'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resetStoreCustomerPassword } from '@/lib/store-customer'

const inputClass =
  'h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30'

export function ResetPassword({
  slug,
  storeName,
  email,
  token,
}: {
  slug: string
  storeName: string
  email: string
  token: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ next: '', confirm: '' })

  const linkValid = Boolean(email && token)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.next !== form.confirm) {
      setError('Şifreler eşleşmiyor.')
      return
    }
    startTransition(async () => {
      const res = await resetStoreCustomerPassword({
        storeSlug: slug,
        email,
        token,
        newPassword: form.next,
      })
      if (res.ok) setDone(true)
      else setError(res.error ?? 'Şifre sıfırlanamadı.')
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href={`/site/${slug}/hesap`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {storeName}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="mb-1 font-display text-2xl font-bold">Yeni şifre belirle</h1>

        {done ? (
          <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
            <CheckCircle2 className="size-10 text-green-500" />
            <p className="text-sm text-muted-foreground">
              Şifreniz başarıyla güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.
            </p>
            <Button onClick={() => router.push(`/site/${slug}/hesap`)}>Girişe git</Button>
          </div>
        ) : !linkValid ? (
          <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
            Bu bağlantı geçersiz veya eksik. Lütfen şifre sıfırlama e-postasındaki bağlantıyı
            kullanın veya yeniden talep edin.
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{email}</span> hesabı için yeni bir şifre
              belirleyin.
            </p>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Yeni şifre</span>
                <input
                  type="password"
                  className={inputClass}
                  value={form.next}
                  onChange={(e) => setForm({ ...form, next: e.target.value })}
                  required
                  minLength={6}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Yeni şifre (tekrar)</span>
                <input
                  type="password"
                  className={inputClass}
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  required
                  minLength={6}
                />
              </label>

              {error && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" disabled={pending} className="gap-2">
                {pending && <Loader2 className="size-4 animate-spin" />}
                Şifreyi güncelle
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
