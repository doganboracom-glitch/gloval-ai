import { hasAnyPaymentBadge, type PaymentBadgeSet } from '@/lib/payment-badges'

type Lang = 'tr' | 'en'

const CHIP_LABEL: Record<'bankTransfer' | 'cashOnDelivery', Record<Lang, string>> = {
  bankTransfer: { tr: 'Havale / EFT', en: 'Bank transfer' },
  cashOnDelivery: { tr: 'Kapıda ödeme', en: 'Cash on delivery' },
}

type LogoKey = 'iyzico' | 'mastercard' | 'visa' | 'amex' | 'troy'

/**
 * Brand marks in display order. Each file is cut from the same official
 * artwork at its native proportions (height is fixed, width follows the
 * intrinsic ratio), so a mark is never stretched or recoloured.
 */
const LOGOS: Array<{ key: LogoKey; src: string; width: number; height: number; label: string }> = [
  { key: 'iyzico', src: '/payment/iyzico-logo.svg', width: 123, height: 32, label: 'iyzico' },
  { key: 'mastercard', src: '/payment/mastercard.svg', width: 39, height: 32, label: 'Mastercard' },
  { key: 'visa', src: '/payment/visa.svg', width: 62, height: 32, label: 'Visa' },
  { key: 'amex', src: '/payment/amex.svg', width: 43, height: 32, label: 'American Express' },
  { key: 'troy', src: '/payment/troy.svg', width: 59, height: 32, label: 'Troy' },
]

/**
 * Payment marks strip, shared by the gloval.ai footer and published store
 * footers. Logos only (no caption). Which marks show is decided by the caller
 * via `badges`; renders nothing when none apply.
 *
 * - `platform`: bare logos on the page background (gloval.ai footer).
 * - `site`: each logo sits on a light plate so the dark wordmarks stay
 *   readable on any generated theme, light or dark. Chips use the site tokens.
 */
export function PaymentBadges({
  badges,
  variant = 'platform',
  lang = 'tr',
  className = '',
}: {
  badges: PaymentBadgeSet | null | undefined
  variant?: 'platform' | 'site'
  lang?: Lang
  className?: string
}) {
  if (!badges || !hasAnyPaymentBadge(badges)) return null

  const plate = variant === 'site'
  const logos = LOGOS.filter((logo) => badges[logo.key])
  const chips = (['bankTransfer', 'cashOnDelivery'] as const).filter((k) => badges[k])

  return (
    <ul
      data-payment-badges={variant}
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 ${className}`}
    >
      {logos.map((logo) => (
        <li
          key={logo.key}
          data-payment-logo={logo.key}
          className={
            plate
              ? 'flex items-center rounded-md border px-2.5 py-1.5'
              : 'flex items-center'
          }
          style={
            plate
              ? { backgroundColor: '#ffffff', borderColor: 'var(--site-border)' }
              : undefined
          }
        >
          <img
            src={logo.src}
            alt={logo.label}
            width={logo.width}
            height={logo.height}
            loading="lazy"
            decoding="async"
            className="h-5 w-auto max-w-full"
          />
        </li>
      ))}
      {chips.map((key) => (
        <li
          key={key}
          className={
            plate
              ? 'rounded-md border px-2.5 py-1 text-xs font-medium'
              : 'rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground'
          }
          style={
            plate
              ? { borderColor: 'var(--site-border)', color: 'var(--site-muted-fg)' }
              : undefined
          }
        >
          {CHIP_LABEL[key][lang]}
        </li>
      ))}
    </ul>
  )
}
