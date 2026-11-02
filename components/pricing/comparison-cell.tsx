import { Check, Minus } from 'lucide-react'
import type { ComparisonCopy } from '@/lib/plan-copy'
import type { ComparisonValue } from '@/lib/pricing-config'

export function ComparisonCell({
  value,
  copy,
  textClassName = 'text-xs sm:text-sm',
}: {
  value: ComparisonValue
  copy: ComparisonCopy
  textClassName?: string
}) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto h-4 w-4 text-brand" aria-hidden />
        <span className="sr-only">{copy.yes}</span>
      </>
    )
  }
  if (value === false) {
    return (
      <>
        <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-hidden />
        <span className="sr-only">{copy.no}</span>
      </>
    )
  }
  if (typeof value === 'object') {
    return (
      <span
        className={`${textClassName} inline-flex max-w-full flex-col items-center gap-0.5 leading-snug`}
      >
        <span>{value.text}</span>
        {value.note ? (
          <span className="max-w-full text-xs font-normal leading-4 text-muted-foreground/70 [overflow-wrap:anywhere]">
            {value.note}
          </span>
        ) : null}
      </span>
    )
  }
  return <span className={textClassName}>{value}</span>
}
