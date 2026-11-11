'use client'

import Link from 'next/link'
import { Package, Rocket } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { PublishOptions } from '@/lib/free-publish'
import { NEW_TICKET_PATH } from '@/lib/support/prefill'

type Choice = Exclude<PublishOptions, { mode: 'direct' }>

/**
 * Shown on "Yayınla" for an owner on the automatic FREE plan. Either offers
 * "publish with FREE" next to "browse packages", or, when FREE cannot publish
 * this site at all, explains why and offers the packages only.
 */
export function PublishChoiceDialog({
  choice,
  onPublishFree,
  onBrowsePackages,
  onClose,
}: {
  choice: Choice
  onPublishFree: () => void
  onBrowsePackages: () => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const p = t.publish

  const reason =
    choice.mode === 'packages_only'
      ? choice.block === 'storefront'
        ? p.freeBlockedStorefront
        : choice.block === 'page_limit'
          ? p.freeBlockedPages.replace('{limit}', String(choice.limit ?? '—'))
          : p.siteLimit.replace('{used}', String(choice.used ?? '—')).replace('{total}', String(choice.total ?? '—'))
      : null
  const isStorefrontBlock = choice.mode === 'packages_only' && choice.block === 'storefront'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-choice-title"
      aria-describedby={isStorefrontBlock ? 'publish-choice-body publish-choice-support' : 'publish-choice-body'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 id="publish-choice-title" className="text-base font-semibold text-foreground">
          {isStorefrontBlock ? p.publishChoiceStorefrontTitle : reason ? p.packagesOnlyTitle : p.choiceTitle}
        </h2>
        <p id="publish-choice-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {reason ?? p.choiceBody}
        </p>
        {isStorefrontBlock && (
          <p id="publish-choice-support" className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <em>
              {p.publishChoiceStorefrontSupportBefore}
              <Link
                href={NEW_TICKET_PATH}
                aria-label={p.publishChoiceStorefrontSupportLinkLabel}
                className="font-medium text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {p.publishChoiceStorefrontSupportLink}
              </Link>
              {p.publishChoiceStorefrontSupportAfter}
            </em>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          {!reason && (
            <button
              type="button"
              autoFocus
              onClick={onPublishFree}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Rocket className="h-4 w-4" />
              {p.choicePublishFree}
            </button>
          )}
          <button
            type="button"
            autoFocus={Boolean(reason)}
            onClick={onBrowsePackages}
            className={
              reason
                ? 'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90'
                : 'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium transition-colors hover:bg-secondary'
            }
          >
            <Package className="h-4 w-4" />
            {p.choiceBrowsePackages}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {p.authRequiredCancel}
          </button>
        </div>
      </div>
    </div>
  )
}
