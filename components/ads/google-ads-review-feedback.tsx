'use client'

import { AlertCircle, Check, CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  describeGoogleErrorField,
  explainGoogleError,
  formatGoogleErrorCode,
  type GoogleErrorDetail,
} from '@/lib/ads/google-error-detail'
import { googleErrorTargetLabel, resolveGoogleErrorTarget } from '@/lib/ads/google-error-target'
import {
  derivePublishStep,
  nextStepText,
  persistedFeedback,
  PUBLISH_STEPS,
  publishStepLabel,
  splitSuccessMessage,
  type PublishProgressPlan,
} from '@/lib/ads/publish-progress'

type FeedbackPlan = PublishProgressPlan & { plan: Record<string, unknown> }

/** Success message with the same visual weight as the destructive error alerts. */
export function GoogleAdsSuccessNotice({ text }: { text: string }) {
  const { title, detail } = splitSuccessMessage(text)
  return (
    <Alert
      role="status"
      className="flex items-start gap-3 border-2 border-emerald-700/40 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-400/50 dark:bg-emerald-950/60 dark:text-emerald-50"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950">
        <CheckCircle2 className="size-6" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-base font-bold leading-snug text-balance">{title}</p>
        {detail ? <p className="text-sm leading-relaxed text-emerald-900 dark:text-emerald-100">{detail}</p> : null}
      </div>
    </Alert>
  )
}

export function GoogleAdsPublishStepper({ plan, isTr }: { plan: PublishProgressPlan; isTr: boolean }) {
  const current = derivePublishStep(plan)
  const currentIndex = PUBLISH_STEPS.indexOf(current)
  const next = nextStepText(plan, isTr)

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label={isTr ? 'Yayın adımları' : 'Publish steps'}>
        {PUBLISH_STEPS.map((step, index) => {
          const done = index < currentIndex || (current === 'published' && index === currentIndex)
          const active = index === currentIndex
          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1',
                active ? 'border-brand/50 bg-brand/10 font-medium text-foreground' : 'border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : <span className="text-xs tabular-nums" aria-hidden="true">{index + 1}</span>}
              {publishStepLabel(step, isTr)}
              {done ? <span className="sr-only">{isTr ? ' (tamamlandı)' : ' (done)'}</span> : null}
            </li>
          )
        })}
      </ol>
      {next ? <p className="text-sm leading-relaxed text-muted-foreground">{next}</p> : null}
    </div>
  )
}

export function GoogleAdsReviewFeedback({
  plan,
  errorTitle,
  googleErrors,
  isTr,
  canEdit,
  onRemoveItem,
}: {
  plan: FeedbackPlan
  errorTitle: string | null
  googleErrors: GoogleErrorDetail[]
  isTr: boolean
  canEdit: boolean
  onRemoveItem: (kind: 'keyword' | 'negativeKeyword', text: string) => void
}) {
  if (errorTitle) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>{errorTitle}</AlertTitle>
        {googleErrors.length > 0 ? (
          <AlertDescription>
            <ul className="mt-1 flex flex-col gap-2">
              {googleErrors.slice(0, 5).map((detail, index) => {
                const target = resolveGoogleErrorTarget(detail.fieldPath ?? undefined, plan.plan)
                const explanation = isTr ? explainGoogleError(detail) : formatGoogleErrorCode(detail)
                const field = target ? null : describeGoogleErrorField(detail.fieldPath)
                const removable = target && canEdit && (target.kind === 'keyword' || target.kind === 'negativeKeyword') ? target : null
                return (
                  <li key={`${detail.category}-${detail.value}-${detail.fieldPath ?? index}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      {target ? (
                        <>
                          <span className="font-medium">{googleErrorTargetLabel(target.kind, isTr)}</span>
                          {'text' in target ? <> {'«'}<span className="font-medium">{target.text}</span>{'»'}</> : null}
                          {': '}
                        </>
                      ) : field ? <span className="font-medium">{field}: </span> : null}
                      {explanation}
                    </span>
                    {removable ? (
                      <Button type="button" size="xs" variant="outline" onClick={() => onRemoveItem(removable.kind as 'keyword' | 'negativeKeyword', removable.text)}>
                        {isTr ? 'Listeden kaldır' : 'Remove from list'}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </AlertDescription>
        ) : null}
      </Alert>
    )
  }

  const saved = persistedFeedback(plan, isTr)
  if (!saved) return null
  if (saved.tone === 'success') return <GoogleAdsSuccessNotice text={saved.text} />
  return (
    <Alert variant={saved.tone === 'error' ? 'destructive' : 'default'} role="alert">
      <AlertCircle aria-hidden="true" />
      <AlertDescription>{saved.text}</AlertDescription>
    </Alert>
  )
}
