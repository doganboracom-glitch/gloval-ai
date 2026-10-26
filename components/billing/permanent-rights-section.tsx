import { BadgeCheck, Sparkles } from 'lucide-react'
import { BRANDING_REMOVAL_CODE, formatMoney } from '@/lib/billing-utils'
import type { ProjectEntitlementItem } from '@/lib/project-entitlements'

export type PermanentRightsCopy = {
  entitlements: string
  noPermanentRights: string
  entitlementHint: string
  entitlementActive: string
  brandingRight: string
  brandingRightHint: string
  oneTime: string
}

export function PermanentRightsSection({
  items,
  copy: b,
}: {
  items: ProjectEntitlementItem[]
  copy: PermanentRightsCopy
}) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Sparkles className="size-5 text-primary" />
        {b.entitlements}
      </h2>
      {/* Rights bought once for a single site (e.g. Copyright Kaldırma). */}
      {items.length > 0 ? (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/70">
          {items.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  <BadgeCheck className="size-4 shrink-0 text-accent" />
                  <span className="truncate">{e.projectName}</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {e.code === BRANDING_REMOVAL_CODE ? b.brandingRightHint : e.name}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
                  {e.code === BRANDING_REMOVAL_CODE ? b.brandingRight : b.entitlementActive}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatMoney(e.amount_cents, e.currency)} · {b.oneTime}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/40 p-6">
          <p className="font-medium">{b.noPermanentRights}</p>
          <p className="mt-1 text-sm text-muted-foreground">{b.entitlementHint}</p>
        </div>
      )}
    </section>
  )
}
