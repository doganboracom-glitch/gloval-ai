'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkButton } from '@/components/link-button'
import { useLanguage } from '@/components/language-provider'

const REDIRECT_DELAY_SECONDS = 3

/**
 * Landing screen after `/auth/callback` finishes a successful email
 * verification (signup confirmation). The callback route signs the
 * just-created session back out before redirecting here, so this is purely
 * the branded "you're verified" moment — it then hands off to a real login
 * screen (carrying `next` through so login lands wherever the user was
 * originally headed) after a short countdown, with an immediate manual
 * escape hatch via the button.
 */
export default function VerifiedPage() {
  return (
    <Suspense fallback={null}>
      <VerifiedContent />
    </Suspense>
  )
}

function VerifiedContent() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'
  const loginHref = `/auth/login?next=${encodeURIComponent(next)}`
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY_SECONDS)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)
    const redirect = window.setTimeout(() => {
      router.replace(loginHref)
    }, REDIRECT_DELAY_SECONDS * 1000)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(redirect)
    }
  }, [loginHref, router])

  return (
    <AuthShell title={t.auth.verifiedTitle} subtitle={t.auth.verifiedBody}>
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary"
          aria-hidden
        >
          <CheckCircle2 className="size-7" />
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {t.auth.verifiedRedirecting.replace('{s}', String(secondsLeft))}
        </p>
        <LinkButton href={loginHref} className="w-full">
          {t.auth.goToDashboard}
        </LinkButton>
      </div>
    </AuthShell>
  )
}
