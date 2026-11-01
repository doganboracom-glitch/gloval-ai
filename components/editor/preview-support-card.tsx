'use client'

import { useEffect, useState } from 'react'
import { Info, X } from 'lucide-react'
import { LinkButton } from '@/components/link-button'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { newTicketHref } from '@/lib/support/prefill'

const DISMISSED_KEY = 'gloval:preview-support-notice:dismissed:v1'
const SHOWN_KEY = 'gloval:preview-support-notice:shown:v1'

type Props = {
  projectId?: string | null
}

export function PreviewSupportCard({ projectId = null }: Props) {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let dismissed = false
    let shownThisSession = false

    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === 'true'
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }

    try {
      shownThisSession = window.sessionStorage.getItem(SHOWN_KEY) === 'true'
    } catch {
      // The card still renders when session storage is unavailable.
    }

    if (dismissed || shownThisSession) return

    try {
      window.sessionStorage.setItem(SHOWN_KEY, 'true')
    } catch {
      // The component remains visible for this mount even without session storage.
    }

    setVisible(true)
  }, [])

  if (!visible) return null

  const ticketHref = newTicketHref({
    department: 'technical',
    service: 'website',
    projectId: projectId ?? undefined,
  })

  function dismiss() {
    setVisible(false)
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // Dismissal still applies to the current mount if storage is blocked.
    }
  }

  return (
    <Alert
      role="note"
      aria-labelledby="preview-support-notice-title"
      data-testid="preview-support-notice"
      className="mb-3 px-4 py-3"
    >
      <Info aria-hidden="true" className="text-brand" />
      <AlertTitle>
        <h2 id="preview-support-notice-title" className="text-sm font-semibold text-foreground">
          {t.preview.supportNotice.title}
        </h2>
      </AlertTitle>
      <AlertDescription className="leading-relaxed">
        <p>{t.preview.supportNotice.body}</p>
        <LinkButton href={ticketHref} variant="brand" size="sm" className="mt-3 w-fit">
          {t.preview.supportNotice.cta}
        </LinkButton>
      </AlertDescription>
      <AlertAction>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.preview.supportNotice.dismiss}
          onClick={dismiss}
        >
          <X data-icon="inline-start" aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  )
}
