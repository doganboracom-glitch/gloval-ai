'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAuthCallbackUrl } from '@/lib/auth-redirect'
import { validateEmail } from '@/lib/email-validation'
import { trackSignUp } from '@/lib/analytics'
import { peekPendingProject } from '@/lib/pending-project'
import { createSignupDraft } from '@/lib/signup-draft-actions'
import {
  clearSignupIdea,
  readSignupDraftFailed,
  readSignupIdea,
  resolvePostSignUp,
  setSignupDraftFailed,
  storeSignupDraftToken,
} from '@/lib/signup-draft-client'
import { readAttribution } from '@/lib/attribution'
import { saveSignupAttribution } from '@/lib/signup-attribution'
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
  const [hasSignupIdea, setHasSignupIdea] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [draftLost, setDraftLost] = useState(false)

  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [typoAcknowledged, setTypoAcknowledged] = useState(false)

  useEffect(() => {
    setHasSignupIdea(Boolean(readSignupIdea()))
  }, [])

  const loginHref = hasSignupIdea
    ? `/auth/login?next=${encodeURIComponent('/auth/restore-idea')}`
    : next === '/dashboard'
      ? '/auth/login'
      : `/auth/login?next=${encodeURIComponent(next)}`

  function checkEmail(value: string): boolean {
    const check = validateEmail(value)
    setSuggestion(check.suggestion ?? null)
    if (!check.ok) {
      setEmailError(t.auth.emailInvalid)
      return false
    }
    setEmailError(null)
    return true
  }

  function applySuggestion() {
    if (!suggestion) return
    setEmail(suggestion)
    setSuggestion(null)
    setEmailError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!checkEmail(email)) return
    // A likely provider typo (gmial.com) is flagged once; a second submit goes through.
    if (validateEmail(email).suggestion && !typoAcknowledged) {
      setTypoAcknowledged(true)
      return
    }
    setLoading(true)
    const supabase = createClient()
    // Park the visitor's unsaved draft on the server, bound to this e-mail, so the
    // verification link can restore it from any tab or device. Never blocks sign-up.
    let draftToken: string | null = null
    const pending = peekPendingProject()
    const idea = pending ? null : readSignupIdea()
    const draftPayload = pending ?? (idea ? { kind: 'idea', prompt: idea } : null)
    setSignupDraftFailed(false)
    if (draftPayload) {
      const draft = await createSignupDraft({ email, draft: draftPayload }).catch(() => null)
      if (draft?.ok) {
        draftToken = draft.token
        storeSignupDraftToken(draft.token)
      } else {
        // Sign-up still proceeds; the success page tells the user the draft could not be saved.
        setSignupDraftFailed(true)
      }
    }
    const callbackParams = new URLSearchParams()
    if (next !== '/dashboard') callbackParams.set('next', next)
    if (draftToken) callbackParams.set('draft', draftToken)
    const callbackQuery = callbackParams.toString()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: callbackQuery
          ? `${getAuthCallbackUrl()}?${callbackQuery}`
          : getAuthCallbackUrl(),
        data: { full_name: fullName },
      },
    })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('rate') || error.status === 429) setError(t.auth.tooManyRequests)
      else if (error.code === 'email_address_invalid' || msg.includes('invalid') && msg.includes('email'))
        setEmailError(t.auth.emailInvalid)
      else if (msg.includes('already') || msg.includes('registered')) setError(t.auth.invalidCreds)
      else setError(t.auth.unexpected)
      setLoading(false)
      return
    }
    if (draftToken) clearSignupIdea()
    // Fire-and-forget: attribution and measurement must never block sign-up.
    if (data.user?.id) {
      const attribution = readAttribution()
      if (attribution) void saveSignupAttribution({ userId: data.user.id, attribution })
    }
    trackSignUp('email')
    // If email confirmation is off, a session already exists → go to dashboard.
    const step = resolvePostSignUp({
      hasSession: !!data.session,
      draftToken,
      draftFailed: readSignupDraftFailed(),
    })
    if (step.kind === 'resume') {
      window.location.assign(`/auth/resume?draft=${step.token}`)
      return
    }
    if (step.kind === 'warn-draft-lost') {
      // Session is open, so the verification page (and its notice) is skipped: warn here.
      setSignupDraftFailed(false)
      setDraftLost(true)
      setLoading(false)
      return
    }
    if (step.kind === 'dashboard') {
      router.push(next)
      router.refresh()
      return
    }
    router.push('/auth/sign-up-success')
  }

  if (draftLost) {
    return (
      <AuthShell title={t.auth.signupTitle} subtitle={t.auth.signupSubtitle}>
        <div className="flex flex-col gap-4">
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-foreground"
          >
            {t.auth.draftNotSavedSignedIn}
          </p>
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              router.push(hasSignupIdea ? '/auth/restore-idea' : next)
              router.refresh()
            }}
          >
            {t.auth.draftNotSavedContinue}
          </Button>
        </div>
      </AuthShell>
    )
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
        <OAuthButtons
          mode="signup"
          next={hasSignupIdea ? '/auth/restore-idea' : next === '/dashboard' ? undefined : next}
        />
        <OAuthDivider />
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label={t.auth.fullName} type="text" value={fullName} onChange={setFullName} autoComplete="name" />
          <Field
            label={t.auth.email}
            type="email"
            value={email}
            onChange={(v) => {
              setEmail(v)
              setEmailError(null)
              setSuggestion(null)
              setTypoAcknowledged(false)
            }}
            onBlur={() => email && checkEmail(email)}
            autoComplete="email"
            required
            error={emailError}
          />
          {suggestion && (
            <p className="-mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{t.auth.emailDidYouMean.replace('{email}', suggestion)}</span>
              <button
                type="button"
                onClick={applySuggestion}
                className="font-medium text-primary hover:underline"
              >
                {t.auth.emailUseSuggestion}
              </button>
            </p>
          )}
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
  onBlur,
  error,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  required?: boolean
  onBlur?: () => void
  error?: string | null
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? true : undefined}
        className="h-11 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-destructive"
      />
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </label>
  )
}
