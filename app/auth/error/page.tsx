'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkButton } from '@/components/link-button'
import { isSignupDraftToken } from '@/lib/signup-draft-shared'

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  )
}

function AuthErrorContent() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const rawDraft = searchParams.get('draft')
  const draft = isSignupDraftToken(rawDraft) ? rawDraft : null
  const email = searchParams.get('email')
  const draftQuery = draft ? `draft=${encodeURIComponent(draft)}` : ''
  const resendQuery = new URLSearchParams()
  if (email) resendQuery.set('email', email)
  if (draft) resendQuery.set('draft', draft)
  const resendHref = email ? `/auth/verify-email?${resendQuery.toString()}` : null
  const loginHref = draft ? `/auth/login?${draftQuery}` : '/auth/login'

  return (
    <AuthShell title={t.auth.errorTitle} subtitle={t.auth.expiredBody}>
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle className="size-7" />
        </div>
        <div className="flex w-full flex-col gap-3">
          <LinkButton href={loginHref} className="w-full">
            {t.auth.toLogin}
          </LinkButton>
          {resendHref && (
            <LinkButton href={resendHref} variant="secondary" className="w-full">
              {t.auth.sendNewLink}
            </LinkButton>
          )}
        </div>
      </div>
    </AuthShell>
  )
}
