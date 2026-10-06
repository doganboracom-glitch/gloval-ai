'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAuthCallbackUrl } from '@/lib/auth-redirect'
import { useLanguage } from '@/components/language-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { OAuthButtons, OAuthDivider } from '@/components/auth/oauth-buttons'

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  )
}

function SignUpForm() {
  const { t } = useLanguage()
  const router = useRouter()
  const rawNext = useSearchParams().get('next') || ''
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\')
      ? rawNext
      : '/dashboard'
  const loginHref = next === '/dashboard' ? '/auth/login' : `/auth/login?next=${encodeURIComponent(next)}`

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          next === '/dashboard'
            ? getAuthCallbackUrl()
            : `${getAuthCallbackUrl()}?next=${encodeURIComponent(next)}`,
        data: { full_name: fullName },
      },
    })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('rate') || error.status === 429) setError(t.auth.tooManyRequests)
      else if (msg.includes('already') || msg.includes('registered')) setError(t.auth.invalidCreds)
      else setError(t.auth.unexpected)
      setLoading(false)
      return
    }
    // If email confirmation is off, a session already exists → go to dashboard.
    if (data.session) {
      router.push(next)
      router.refresh()
      return
    }
    router.push('/auth/sign-up-success')
  }

  return (
    <AuthShell
      title={t.auth.signupTitle}
      subtitle={t.auth.signupSubtitle}
      footer={
        <>
          {t.auth.haveAccount}{' '}
          <Link href={loginHref} className="font-medium text-primary hover:underline">
            {t.auth.toLogin}
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <OAuthButtons mode="signup" next={next === '/dashboard' ? undefined : next} />
        <OAuthDivider />
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label={t.auth.fullName} type="text" value={fullName} onChange={setFullName} autoComplete="name" />
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
            autoComplete="new-password"
            required
          />
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={loading} className="mt-2 w-full">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.auth.signingUp}
              </>
            ) : (
              t.auth.signup
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
