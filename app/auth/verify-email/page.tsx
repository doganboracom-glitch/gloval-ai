'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, MailWarning } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAuthCallbackUrl } from '@/lib/auth-redirect'
import { isSignupDraftToken } from '@/lib/signup-draft-shared'
import { readSignupDraftToken } from '@/lib/signup-draft-client'
import { validateEmail } from '@/lib/email-validation'
import { sanitizeNextPath } from '@/lib/safe-redirect'
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
  const rawDraft = searchParams.get('draft')
  const storedDraft = readSignupDraftToken()
  const draftToken = isSignupDraftToken(rawDraft)
    ? rawDraft
    : isSignupDraftToken(storedDraft)
      ? storedDraft
      : null
  const next = sanitizeNextPath(searchParams.get('next'))

  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const resolvedRef = useRef(false)

  // Prefer the authenticated email, then send verified users to their safe
  // destination (including any pending draft resume).
  useEffect(() => {
    if (resolvedRef.current) return
    resolvedRef.current = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user
      if (user?.email_confirmed_at) {
        router.replace(draftToken ? `/auth/resume?draft=${encodeURIComponent(draftToken)}` : next)
        return
      }
      if (user?.email) setEmail(user.email)
    })
  }, [draftToken, next, router])

  // Tick down the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function handleResend() {
    if (cooldown > 0 || sending) return
    const validatedEmail = validateEmail(email)
    if (!validatedEmail.ok) {
      setEmailError(t.auth.emailInvalid)
      return
    }

    setSending(true)
    setError(null)
    setEmailError(null)
    setNotice(null)
    const redirectUrl = new URL(getAuthCallbackUrl())
    redirectUrl.searchParams.delete('draft')
    redirectUrl.searchParams.delete('next')
    if (draftToken) redirectUrl.searchParams.set('draft', draftToken)
    if (next !== '/dashboard') redirectUrl.searchParams.set('next', next)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: validatedEmail.email,
      options: {
        emailRedirectTo: redirectUrl.toString(),
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
    const params = new URLSearchParams()
    if (draftToken) params.set('draft', draftToken)
    else if (next !== '/dashboard') params.set('next', next)
    const query = params.toString()
    router.push(query ? `/auth/login?${query}` : '/auth/login')
    router.refresh()
  }

  return (
    <AuthShell title={t.auth.verifyTitle} subtitle={t.auth.verifyBody}>
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MailWarning className="size-7" />
        </div>

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

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void handleResend()
          }}
          className="flex w-full flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-sm font-medium text-foreground">{t.auth.email}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setEmailError(null)
                setError(null)
              }}
              autoComplete="email"
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'resend-email-error' : undefined}
              required
              className="h-11 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-destructive"
            />
          </label>
          {emailError && (
            <p id="resend-email-error" role="alert" className="text-left text-sm text-destructive">
              {emailError}
            </p>
          )}
          <Button type="submit" disabled={sending || cooldown > 0 || !email} size="lg" className="w-full">
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
        </form>
        <Button onClick={handleSignOut} variant="secondary" size="lg" className="w-full">
          {t.auth.logout}
        </Button>
      </div>
    </AuthShell>
  )
}
