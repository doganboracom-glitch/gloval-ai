'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useLanguage } from '@/components/language-provider'
import { deleteProject, type DeleteProjectResult } from '@/lib/projects'
import { tenantUrl } from '@/lib/domains'
import { isDeleteConfirmation, SITE_DELETE_WORD_EN, SITE_DELETE_WORD_TR } from '@/lib/site-delete-confirm'

export type SiteToDelete = {
  id: string
  name: string
  slug: string | null
  isStore: boolean
}

type Props = {
  /** The site awaiting confirmation; `null` keeps the dialog closed. */
  site: SiteToDelete | null
  onClose: () => void
  /** Called once the site is really gone, so the caller can leave the page / refresh. */
  onDeleted: (site: SiteToDelete) => void
}

/**
 * The single confirmation flow for permanently deleting a site. Every place that
 * can delete a site (dashboard card, any future editor/settings entry) renders
 * this component, so the wording, the typed confirmation and the server call are
 * identical everywhere. The server action re-validates the confirmation and the
 * ownership, so nothing here is a security boundary.
 */
export function DeleteSiteDialog({ site, onClose, onDeleted }: Props) {
  if (!site) return null
  return <DeleteSiteDialogBody key={site.id} site={site} onClose={onClose} onDeleted={onDeleted} />
}

function errorKey(result: Extract<DeleteProjectResult, { ok: false }>) {
  switch (result.reason) {
    case 'CONFIRMATION_REQUIRED':
      return 'errorConfirmation'
    case 'NOT_FOUND':
      return 'errorNotFound'
    case 'UNAUTHENTICATED':
      return 'errorSession'
    default:
      return 'errorGeneric'
  }
}

function DeleteSiteDialogBody({ site, onClose, onDeleted }: Props & { site: SiteToDelete }) {
  const { t, lang } = useLanguage()
  const d = t.dash.deleteSite
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmed = isDeleteConfirmation(text)
  const word = lang === 'tr' ? SITE_DELETE_WORD_TR : SITE_DELETE_WORD_EN
  const address = site.slug ? tenantUrl(site.slug) : null

  async function submit() {
    if (!confirmed || pending) return
    setPending(true)
    setError(null)
    try {
      const result = await deleteProject(site.id, text)
      if (result.ok) {
        onDeleted(site)
        return
      }
      setError(d[errorKey(result)])
    } catch {
      setError(d.errorGeneric)
    }
    setPending(false)
  }

  const losses = [d.lossLive, d.lossDomain, d.lossContent, d.lossAddons, ...(site.isStore ? [d.lossOrders] : [])]

  return (
    <ConfirmDialog
      open
      destructive
      title={d.title}
      description={d.intro}
      confirmLabel={pending ? d.deleting : d.confirm}
      cancelLabel={d.cancel}
      confirmDisabled={!confirmed || pending}
      onConfirm={() => void submit()}
      onCancel={() => {
        if (!pending) onClose()
      }}
    >
      <div className="mt-3 rounded-lg border border-border bg-background/60 px-3 py-2">
        <p className="break-words text-sm font-semibold text-foreground">{site.name}</p>
        <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{address ?? d.addressNone}</p>
      </div>

      <p className="mt-4 text-sm font-medium text-foreground">{d.consequencesTitle}</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-destructive">
        {losses.map((loss) => (
          <li key={loss}>{loss}</li>
        ))}
      </ul>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{d.keepsNote}</p>

      <p className="mt-4 text-sm font-bold text-destructive">{d.irreversible}</p>

      <label className="mt-4 block text-sm font-medium text-foreground">
        {d.inputLabel}
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            event.preventDefault()
            void submit()
          }}
          disabled={pending}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={word}
          className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-destructive focus:ring-2 focus:ring-destructive/30 disabled:opacity-60"
        />
      </label>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </ConfirmDialog>
  )
}
