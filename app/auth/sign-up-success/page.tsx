'use client'

import { Info, MailCheck } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkButton } from '@/components/link-button'

export default function SignUpSuccessPage() {
  const { t } = useLanguage()
  return (
    <AuthShell title={t.auth.checkEmail} subtitle={t.auth.checkEmailBody}>
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MailCheck className="size-7" />
        </div>
        <div className="flex w-full items-start gap-3 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-left">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">{t.auth.checkEmailSpam}</p>
        </div>
        <LinkButton href="/auth/login" variant="secondary" className="w-full">
          {t.auth.toLogin}
        </LinkButton>
      </div>
    </AuthShell>
  )
}
