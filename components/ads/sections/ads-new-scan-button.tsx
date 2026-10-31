'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import styles from './ads-new-scan-button.module.css'

export function AdsNewScanButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 cursor-pointer items-center rounded-xl border border-border/70 bg-transparent px-4 text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        styles.button,
      )}
    >
      {children}
    </button>
  )
}
