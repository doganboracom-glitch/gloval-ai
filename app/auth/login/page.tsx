'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/components/language-provider'
import { Suspense, useEffect } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { OAuthButtons, OAuthDivider } from '@/components/auth/oauth-buttons'

// The login form reads the `next` query param via useSearchParams, which Next
// requires to sit inside a Suspense boundary so the shell can prerender while
// the param resolves on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next') || '/dashboard'
  // Yalnızca aynı origin içi yollar; açık yönlendirmeyi engeller.
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\')
      ? rawNext
      : '/dashboard'
  const signUpHref = next === '/dashboard' ? '/auth/sign-up' : `/auth/sign-up?next=${encodeURIComponent(next)}`

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (searchParams.get('error') === 'oauth') setError(t.auth.oauthFailed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const msg = error.message.toLowerCase()
      // Unconfirmed email → send them to the verification screen (with the
      // email so they can resend) instead of the dashboard.
      if (msg.includes('confirm') || msg.includes('verify')) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`)
        return
      }
      if (msg.includes('rate') || error.status === 429) setError(t.auth.tooManyRequests)
      else setError(t.auth.invalidCreds)
      setLoading(false)
      return
    }
    // Defense-in-depth: even if a session was issued, block unverified users.
    if (data.user && !data.user.email_confirmed_at) {
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`)
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <AuthShell
      title={t.auth.loginTitle}
      subtitle={t.auth.loginSubtitle}
      footer={
        <>
          {t.auth.noAccount}{' '}
          <Link href={signUpHref} className="font-medium text-primary hover:underline">
            {t.auth.toSignup}
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <OAuthButtons mode="login" next={next} />
        <OAuthDivider />
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field
            label={t.auth.email}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <Field
            label={t.auth.password}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
          <div className="-mt-2 text-right">
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              Şifremi unuttum
            </Link>
          </div>
          <Button type="submit" size="lg" disabled={loading} className="mt-2 w-full">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.auth.loggingIn}
              </>
            ) : (
              t.auth.login
            )}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="h-11 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
    </label>
  )
}
