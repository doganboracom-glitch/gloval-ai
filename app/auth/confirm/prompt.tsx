'use client'

import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'

type ConfirmationType = 'signup' | 'email'

type EmailConfirmationPromptProps = {
  tokenHash: string | null
  type: ConfirmationType | null
  draft: string | null
  next: string
}

export function EmailConfirmationPrompt({
  tokenHash,
  type,
  draft,
  next,
}: EmailConfirmationPromptProps) {
  const { t } = useLanguage()
  const canConfirm = Boolean(tokenHash && type)
  const resendQuery = new URLSearchParams()

  if (draft) resendQuery.set('draft', draft)
  if (next !== '/dashboard') resendQuery.set('next', next)

  const resendSearch = resendQuery.toString()
  const resendHref = resendSearch ? `/auth/verify-email?${resendSearch}` : '/auth/verify-email'

  return (
    <AuthShell
      title={t.auth.verifyTitle}
      subtitle={canConfirm ? t.auth.verifyBody : t.auth.confirmLinkMissing}
    >
      <div className="flex w-full flex-col gap-4">
        {canConfirm && (
          <form action="/auth/confirm/verify" method="post">
            <input type="hidden" name="token_hash" value={tokenHash ?? ''} />
            <input type="hidden" name="type" value={type ?? ''} />
            <input type="hidden" name="draft" value={draft ?? ''} />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" size="lg" className="w-full">
              {t.auth.confirmEmail}
            </Button>
          </form>
        )}
        <Link
          href={resendHref}
          prefetch={false}
          className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t.auth.sendNewLink}
        </Link>
      </div>
    </AuthShell>
  )
}
