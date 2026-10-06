'use client'

import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { StatusBadge, type MailStatusTone } from '@/components/mail/status-badge'

const TONE: Record<string, MailStatusTone> = {
  gift: 'success',
  package: 'success',
  adjustment: 'warning',
  usage: 'muted',
}

/** Renders an AI-credit ledger `kind` as a localized, tone-coded pill. */
export function CreditKindBadge({ kind }: { kind: string }) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const label =
    kind === 'gift'
      ? t.credits.kindGift
      : kind === 'package'
        ? t.credits.kindPackage
        : kind === 'adjustment'
          ? t.credits.kindAdjustment
          : t.credits.kindUsage
  return <StatusBadge tone={TONE[kind] ?? 'muted'}>{label}</StatusBadge>
}
