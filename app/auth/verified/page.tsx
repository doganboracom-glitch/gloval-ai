'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkButton } from '@/components/link-button'
import { useLanguage } from '@/components/language-provider'
import { sanitizeNextPath } from '@/lib/safe-redirect'

/**
 * Landing screen after an email verification (signup confirmation) finishes.
 * The verifying route signs the just-created session back out before
 * redirecting here, so this is purely the branded "you're verified" moment.
 * It never redirects on its own: the link may have been opened on a different
 * device than the one that started the sign-up, so the user chooses whether to
 * continue in their original tab or sign in here (`next` is carried through,
 * including any pending signup draft resume path).
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
  const searchParams = useSearchParams()

  const next = sanitizeNextPath(searchParams.get('next'))
  const loginHref = `/auth/login?next=${encodeURIComponent(next)}`

  return (
    <AuthShell title={t.auth.verifiedTitle} subtitle={t.auth.verifiedBody}>
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary"
          aria-hidden
        >
          <CheckCircle2 className="size-7" />
        </div>
        <LinkButton href={loginHref} className="w-full">
          {t.auth.goToDashboard}
        </LinkButton>
      </div>
    </AuthShell>
  )
}
