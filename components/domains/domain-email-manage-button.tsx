'use client'

import { Button } from '@/components/ui/button'
import { LinkButton } from '@/components/link-button'
import { useLanguage } from '@/components/language-provider'

export function DomainEmailManageButton({ canManage }: { canManage: boolean }) {
  const { t } = useLanguage()
  const d = t.domains

  return (
    <div className="flex flex-col items-start gap-2">
      {canManage ? (
        <LinkButton href="/dashboard/email" variant="secondary" size="sm">
          {d.emailManage}
        </LinkButton>
      ) : (
        <Button variant="secondary" size="sm" disabled>
          {d.emailManage}
        </Button>
      )}
      <p className="max-w-lg text-pretty text-xs text-muted-foreground">
        {canManage ? d.emailExternalDnsHint : d.emailNeedsWebsite}
      </p>
    </div>
  )
}
