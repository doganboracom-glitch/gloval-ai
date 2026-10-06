'use client'

import { AlertTriangle } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkButton } from '@/components/link-button'

export default function AuthErrorPage() {
  const { t } = useLanguage()
  return (
    <AuthShell title={t.auth.errorTitle} subtitle={t.auth.expiredBody}>
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle className="size-7" />
        </div>
        <div className="flex w-full flex-col gap-3">
          <LinkButton href="/auth/verify-email" className="w-full">
            {t.auth.sendNewLink}
          </LinkButton>
          <LinkButton href="/auth/login" variant="secondary" className="w-full">
            {t.auth.toLogin}
          </LinkButton>
        </div>
      </div>
    </AuthShell>
  )
}
