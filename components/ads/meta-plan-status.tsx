'use client'

import {
  Archive,
  CircleAlert,
  CircleDashed,
  CirclePause,
  CirclePlay,
  Hourglass,
  LoaderCircle,
  PencilLine,
  type LucideIcon,
} from 'lucide-react'
import {
  metaPlanPickerAriaLabel,
  metaPlanStatusView,
  type MetaPlanIconKey,
  type MetaPlanLang,
} from '@/lib/ads/meta-plan-status'

const ICONS: Record<MetaPlanIconKey, LucideIcon> = {
  draft: PencilLine,
  paused: CirclePause,
  partial: CircleDashed,
  active: CirclePlay,
  review: Hourglass,
  error: CircleAlert,
  archived: Archive,
  publishing: LoaderCircle,
}

type PlanLike = { status: string; effectiveStatus?: string | null }

function StatusIcon({ icon }: { icon: MetaPlanIconKey }) {
  const Icon = ICONS[icon]
  return <Icon aria-hidden="true" className={icon === 'publishing' ? 'size-3.5 motion-safe:animate-spin' : 'size-3.5'} />
}

/** Neon status badge (icon + text). Shares one mapping with the picker and the Overview summaries. */
export function MetaPlanStatusChip({
  plan,
  lang = 'tr',
  selected = false,
  className,
}: {
  plan: PlanLike
  lang?: MetaPlanLang
  selected?: boolean
  className?: string
}) {
  const view = metaPlanStatusView(plan, lang)
  return (
    <span
      role="img"
      aria-label={view.ariaLabel}
      className={`plan-status plan-status--${view.colorKey}${className ? ` ${className}` : ''}`}
      data-status={view.key}
      data-glow={view.glow}
      data-pulse={view.pulse}
      data-selected={selected}
    >
      <StatusIcon icon={view.icon} />
      <span>{view.label}</span>
    </span>
  )
}

/** Plan picker button: plan name + status icon/label; the open plan gets the purple neon ring whatever its status. */
export function MetaPlanPickerButton({
  name,
  plan,
  selected,
  lang = 'tr',
  onClick,
}: {
  name: string
  plan: PlanLike
  selected: boolean
  lang?: MetaPlanLang
  onClick: () => void
}) {
  const view = metaPlanStatusView(plan, lang)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={metaPlanPickerAriaLabel(name, view, selected, lang)}
      aria-pressed={selected}
      title={`${name} · ${view.label}`}
      className={`plan-status plan-picker plan-status--${view.colorKey}`}
      data-status={view.key}
      data-glow={view.glow}
      data-pulse={view.pulse}
      data-selected={selected}
    >
      <span className="plan-picker__name truncate">{name}</span>
      <span aria-hidden="true" className="plan-picker__sep">
        ·
      </span>
      <span aria-hidden="true" className="plan-picker__status">
        <StatusIcon icon={view.icon} />
        {view.label}
      </span>
    </button>
  )
}
