'use client'

import { useLanguage } from '@/components/language-provider'
import { LinkButton } from '@/components/link-button'
import { MakerRequestDialog } from '@/components/pricing/maker-request-dialog'
import { newTicketHref } from '@/lib/support/prefill'

export function PricingJetBand({
  isAuthenticated,
  makerRequestsEnabled = false,
}: {
  isAuthenticated: boolean
  makerRequestsEnabled?: boolean
}) {
  const { lang, t } = useLanguage()
  const copy = t.pricing.jetOffer
  const href = isAuthenticated
    ? newTicketHref({
        department: 'technical',
        service: 'website',
        message: copy.messageTemplate,
      })
    : `/iletisim?${new URLSearchParams({ message: copy.guestPrefillMessage }).toString()}`

  return (
    <section
      aria-labelledby="pricing-jet-band-title"
      className="mt-8 flex flex-col gap-5 rounded-2xl border border-brand/30 bg-card p-6 shadow-sm sm:p-8 md:flex-row md:items-center md:justify-between"
    >
      <div className="min-w-0 max-w-3xl">
        <h3
          id="pricing-jet-band-title"
          className="text-balance font-display text-xl font-semibold tracking-tight sm:text-2xl"
        >
          {copy.title}
        </h3>
        <p className="mt-1 text-pretty font-medium text-foreground">
          {copy.subtitle}
        </p>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          {copy.body}
        </p>
      </div>
      {makerRequestsEnabled ? (
        <MakerRequestDialog lang={lang} />
      ) : (
        <LinkButton href={href} variant="brand" size="lg" className="w-full shrink-0 md:w-auto">
          {copy.cta}
        </LinkButton>
      )}
    </section>
  )
}
