'use client'

import { useEffect, useState } from 'react'
import { Info, X } from 'lucide-react'
import { LinkButton } from '@/components/link-button'
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
    <aside
      aria-labelledby="preview-support-notice-title"
      data-testid="preview-support-notice"
      className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground shadow-sm"
    >
      <Info className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id="preview-support-notice-title" className="text-sm font-semibold text-foreground">
          {t.preview.supportNotice.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.preview.supportNotice.body}</p>
        <LinkButton href={ticketHref} variant="brand" size="sm" className="mt-3 w-fit">
          {t.preview.supportNotice.cta}
        </LinkButton>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label={t.preview.supportNotice.dismiss}
        onClick={dismiss}
      >
        <X aria-hidden="true" />
      </Button>
    </aside>
  )
}
