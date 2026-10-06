import Image from 'next/image'
import { cn } from '@/lib/utils'

// Intrinsic size of the trimmed brand asset (public/logo.png). Kept here so
// next/image always renders at the correct aspect ratio (~8.46:1) and never
// stretches or squashes the wordmark.
const LOGO_W = 1650
const LOGO_H = 195

/**
 * The GLOVAL AI brand wordmark, rendered from the real logo asset.
 *
 * Sizing is width-driven with `h-auto` so the aspect ratio is always
 * preserved. Defaults match the header spec (≈100px mobile → ≈120px desktop);
 * pass `className` with a different `w-*` to resize for other surfaces
 * (footer, auth, dashboard) without ever distorting the logo.
 *
 * Set `beta` to show a glowing purple neon "BETA" tag next to the wordmark.
 */
export function BrandLogo({
  className,
  priority = false,
  beta = false,
}: {
  className?: string
  priority?: boolean
  beta?: boolean
}) {
  const logo = (
    <Image
      src="/logo.png"
      alt="GLOVAL AI"
      width={LOGO_W}
      height={LOGO_H}
      priority={priority}
      className={cn('h-auto w-[100px] select-none sm:w-[120px]', className)}
    />
  )

  if (!beta) return logo

  return (
    <span className="inline-flex items-center gap-2">
      {logo}
      <span
        aria-label="Beta"
        className="beta-neon rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.18em] sm:text-[11px]"
      >
        Beta
      </span>
    </span>
  )
}
