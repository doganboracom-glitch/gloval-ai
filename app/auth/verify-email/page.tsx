'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, MailWarning } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAuthCallbackUrl } from '@/lib/auth-redirect'
import { useLanguage } from '@/components/language-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'

const RESEND_COOLDOWN_SECONDS = 60

// Reads the pending email from the query string, which Next requires to sit
// inside a Suspense boundary.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  )
}

function VerifyEmail() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resolvedRef = useRef(false)

  // If a session exists, prefer the real authenticated email over the query
  // param, and bounce already-verified users straight to the dashboard.
  useEffect(() => {
    if (resolvedRef.current) return
    resolvedRef.current = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user
      if (user?.email_confirmed_at) {
        router.replace('/dashboard')
        return
      }
      if (user?.email) setEmail(user.email)
    })
  }, [router])

  // Tick down the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function handleResend() {
    if (cooldown > 0 || sending || !email) return
    setSending(true)
    setError(null)
    setNotice(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: getAuthCallbackUrl(),
      },
    })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('rate') || error.status === 429) setError(t.auth.tooManyRequests)
      else setError(t.auth.resendError)
      setSending(false)
      return
    }
    setNotice(t.auth.resent)
    setCooldown(RESEND_COOLDOWN_SECONDS)
    setSending(false)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <AuthShell title={t.auth.verifyTitle} subtitle={t.auth.verifyBody}>
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MailWarning className="size-7" />
        </div>

        {email && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{email}</span>
          </p>
        )}

        {notice && (
          <p className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {notice}
          </p>
        )}
        {error && (
          <p className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex w-full flex-col gap-3">
          <Button
            onClick={handleResend}
            disabled={sending || cooldown > 0 || !email}
            size="lg"
            className="w-full"
          >
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.auth.resending}
              </>
            ) : cooldown > 0 ? (
              t.auth.resendWait.replace('{s}', String(cooldown))
            ) : (
              t.auth.resend
            )}
          </Button>
          <Button onClick={handleSignOut} variant="secondary" size="lg" className="w-full">
            {t.auth.logout}
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}
