'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  buildSignUpLoginHref,
  buildSignUpSuccessHref,
  getAuthCallbackUrl,
  resolveSignUpNextPath,
} from '@/lib/auth-redirect'
import { validateEmail } from '@/lib/email-validation'
import { trackSignUp } from '@/lib/analytics'
import { trackFunnelEvent, VERCEL_FUNNEL_EVENTS } from '@/lib/vercel-analytics'
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
  import { storePendingVerification } from '@/lib/signup-pending-verification'
  import { readAttribution } from '@/lib/attribution'
import { saveSignupAttribution } from '@/lib/signup-attribution'
import { saveEmailReferralAction } from '@/lib/referrals/actions'
import { prepareReferralSignupIntent } from '@/lib/referrals/client'
import { useLanguage } from '@/components/language-provider'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import { AuthShell } from '@/components/auth/auth-shell'
import { keepAuthFieldVisibleOnMobile } from '@/components/auth/mobile-field-scroll'
import { Button } from '@/components/ui/button'
import { OAuthButtons, OAuthDivider } from '@/components/auth/oauth-buttons'

type SignupErrorReason = 'validation' | 'email_taken' | 'weak_password' | 'network' | 'other'

const SIGNUP_EMAIL_INVALID_MESSAGE = 'Geçerli bir e-posta adresi gir.'

function getSignupErrorReason(error: unknown): SignupErrorReason {
  const details = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const message = typeof details.message === 'string' ? details.message.toLowerCase() : ''
  const code = typeof details.code === 'string' ? details.code.toLowerCase() : ''
  const name = typeof details.name === 'string' ? details.name : ''

  if (code === 'email_address_invalid' || (message.includes('invalid') && message.includes('email'))) {
    return 'validation'
  }
  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    message.includes('already') ||
    message.includes('registered')
  ) {
    return 'email_taken'
  }
  if (
    code === 'weak_password' ||
    (message.includes('password') && /weak|short|at least|minimum|strength|length/.test(message))
  ) {
    return 'weak_password'
  }
  if (
    name === 'AuthRetryableFetchError' ||
    error instanceof TypeError ||
    details.status === 0 ||
    /network|fetch|timeout|connection/.test(message)
  ) {
    return 'network'
  }
  return 'other'
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  )
}

function SignUpForm() {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const next = sanitizeNextPath(useSearchParams().get('next'))
  const [hasSignupIdea, setHasSignupIdea] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [draftLost, setDraftLost] = useState(false)

  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [typoAcknowledged, setTypoAcknowledged] = useState(false)

  useEffect(() => {
    setHasSignupIdea(Boolean(readSignupIdea()))
    trackFunnelEvent(VERCEL_FUNNEL_EVENTS.signupView)
  }, [])

  const signupNext = resolveSignUpNextPath(next, hasSignupIdea)
  const loginHref = buildSignUpLoginHref(next, hasSignupIdea)

  function checkEmail(value: string): boolean {
    const check = validateEmail(value)
    setSuggestion(check.suggestion ?? null)
    if (!check.ok) {
      setEmailError(SIGNUP_EMAIL_INVALID_MESSAGE)
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
    setPasswordError(null)
    if (!email.trim()) {
      setEmailError(SIGNUP_EMAIL_INVALID_MESSAGE)
      trackFunnelEvent(VERCEL_FUNNEL_EVENTS.signupError, { reason: 'validation' })
      emailRef.current?.focus()
      return
    }
    if (!checkEmail(email)) {
      trackFunnelEvent(VERCEL_FUNNEL_EVENTS.signupError, { reason: 'validation' })
      emailRef.current?.focus()
      return
    }
    if (!password) {
      setPasswordError('Şifreni gir.')
      trackFunnelEvent(VERCEL_FUNNEL_EVENTS.signupError, { reason: 'validation' })
      passwordRef.current?.focus()
      return
    }
    // A likely provider typo (gmial.com) is flagged once; a second submit goes through.
    if (validateEmail(email).suggestion && !typoAcknowledged) {
      setTypoAcknowledged(true)
      return
    }
    setLoading(true)
    trackFunnelEvent(VERCEL_FUNNEL_EVENTS.signupSubmit, { method: 'email' })
    const supabase = createClient()
    // Park the visitor's unsaved draft on the server, bound to this e-mail, so the
    // verification link can restore it from any tab or device. Never blocks sign-up.
    let draftToken: string | null = null
    const pending = peekPendingProject()
    const idea = pending ? null : readSignupIdea()
    const draftPayload = (pending ? { ...pending, clientToken: pending.token } : null) ?? (idea ? { kind: 'idea', prompt: idea } : null)
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
    const callbackUrl = new URL(getAuthCallbackUrl())
    for (const [key, value] of callbackParams) callbackUrl.searchParams.set(key, value)
    await prepareReferralSignupIntent('email')
    const signupResponse = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: callbackUrl.toString(),
        data: {
          full_name: fullName,
          email_locale: lang,
          signup_next_path: encodeURIComponent(next),
          ...(draftToken ? { signup_draft_token: draftToken } : {}),
        },
      },
    }).catch((signupError: unknown) => {
      const reason = getSignupErrorReason(signupError)
      trackFunnelEvent(VERCEL_FUNNEL_EVENTS.signupError, { reason })
      setError(reason === 'network' ? 'Bağlantı sorunu yaşandı. Lütfen tekrar deneyin.' : t.auth.unexpected)
      setLoading(false)
      return null
    })
    if (!signupResponse) return
    const { data, error } = signupResponse
    if (error) {
      const msg = error.message.toLowerCase()
      const reason = getSignupErrorReason(error)
      trackFunnelEvent(VERCEL_FUNNEL_EVENTS.signupError, { reason })
      if (msg.includes('rate') || error.status === 429) setError(t.auth.tooManyRequests)
      else if (reason === 'validation') {
        setEmailError(SIGNUP_EMAIL_INVALID_MESSAGE)
        emailRef.current?.focus()
      } else if (reason === 'email_taken') {
        setEmailError('Bu e-posta adresiyle devam edilemiyor. Giriş yapmayı deneyebilirsin.')
        emailRef.current?.focus()
      } else if (reason === 'weak_password') {
        setPasswordError('Şifre en az 8 karakter olmalı.')
        passwordRef.current?.focus()
      } else if (reason === 'network') setError('Bağlantı sorunu yaşandı. Lütfen tekrar deneyin.')
      else setError(t.auth.unexpected)
      setLoading(false)
      return
    }
    if (draftToken) clearSignupIdea()
    // Existing analytics attribution stays fire-and-forget; signed referral binding is best-effort server-side.
    if (data.user?.id) {
      const attribution = readAttribution()
      if (attribution) void saveSignupAttribution({ userId: data.user.id, attribution })
      await saveEmailReferralAction({ userId: data.user.id })
    }
    trackSignUp('email', data.user?.id)
    // If email confirmation is off, a session already exists → go to dashboard.
    const step = resolvePostSignUp({
      hasSession: !!data.session,
      draftToken,
      draftFailed: readSignupDraftFailed(),
    })
    if (data.session && next !== '/dashboard') {
      router.push(next)
      router.refresh()
      return
    }
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
    storePendingVerification(email.trim().toLowerCase())
    router.push(buildSignUpSuccessHref(next))
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
              router.push(signupNext)
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
          next={signupNext === '/dashboard' ? undefined : signupNext}
        />
        <OAuthDivider />
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field
            id="signup-full-name"
            label={t.auth.fullName}
            type="text"
            value={fullName}
            onChange={setFullName}
            autoComplete="name"
            placeholder="Adın Soyadın"
          />
          <Field
            id="signup-email"
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
            placeholder="ornek@ornek.com"
            inputRef={emailRef}
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
            id="signup-password"
            label={t.auth.password}
            type={passwordVisible ? 'text' : 'password'}
            value={password}
            onChange={(value) => {
              setPassword(value)
              setPasswordError(null)
            }}
            autoComplete="new-password"
            required
            placeholder="En az 8 karakter"
            inputRef={passwordRef}
            error={passwordError}
            trailingAction={
              <button
                type="button"
                aria-label="Şifreyi göster/gizle"
                aria-pressed={passwordVisible}
                aria-controls="signup-password"
                title={passwordVisible ? 'Şifreyi gizle' : 'Şifreyi göster'}
                onClick={() => setPasswordVisible((visible) => !visible)}
                className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {passwordVisible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
              </button>
            }
          />
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              size="lg"
              variant="brand"
              disabled={loading}
              className="h-12 w-full disabled:bg-muted disabled:text-muted-foreground"
            >
              {loading ? (
                <>
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                  {t.auth.signingUp}
                </>
              ) : (
                t.auth.signup
              )}
            </Button>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Ücretsiz plan: kredi kartı gerekmez.
            </p>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              E-posta ile kayıtta doğrulama bağlantısı göndeririz.
            </p>
          </div>
        </form>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Hesap oluşturarak{' '}
          <Link href="/yasal/kullanim-kosullari" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
            Kullanım Koşulları
          </Link>{' '}
          ve{' '}
          <Link href="/yasal/gizlilik-politikasi" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
            Gizlilik Politikası&apos;nı
          </Link>{' '}
          kabul etmiş olursun.
        </p>
      </div>
    </AuthShell>
  )
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
  onBlur,
  error,
  placeholder,
  inputRef,
  trailingAction,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  required?: boolean
  onBlur?: () => void
  error?: string | null
  placeholder?: string
  inputRef?: React.Ref<HTMLInputElement>
  trailingAction?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          onFocus={keepAuthFieldVisibleOnMobile}
          required={required}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-11 w-full rounded-lg border border-input bg-background/60 px-3 pr-12 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-destructive"
        />
        {trailingAction}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
