'use client'

import dynamic from 'next/dynamic'
import type { CursorAuraConfig } from '@/lib/cursor-aura'

const CursorAura = dynamic(() => import('./cursor-aura'), { ssr: false })

/**
 * Loads the effect code lazily. The server layout renders this only when the
 * site's flag is on, so sites without the flag never download the effect chunk.
 */
export function CursorAuraGate({ config }: { config: CursorAuraConfig | null }) {
  if (!config || !config.enabled) return null
  return <CursorAura config={config} />
}
