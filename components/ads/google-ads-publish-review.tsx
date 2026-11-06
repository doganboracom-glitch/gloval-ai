'use client'

import Link from 'next/link'

export type GoogleAdsPublishReviewDetails = {
  account: string
  campaign: string
  finalUrl: string
  dailyBudget: string
  cpcCeiling: string
  targeting: string
  keywords: string[]
  negativeKeywords: string[]
  headlines: string[]
  descriptions: string[]
}

export type GoogleAdsPublishReviewCopy = {
  title: string
  description: string
  account: string
  campaign: string
  finalUrl: string
  dailyBudget: string
  cpcCeiling: string
  targeting: string
  keywords: string
  negativeKeywords: string
  headlines: string
  descriptions: string
  notSpecified: string
  budgetDisclosure: string
  pausedNote: string
  billingNote: string
  creditsNote: string
  consentLegend: string
  consentText: string
  termsLink: string
  privacyLink: string
}

export function GoogleAdsPublishReview({
  details,
  copy,
  confirmed,
  onConfirmedChange,
}: {
  details: GoogleAdsPublishReviewDetails
  copy: GoogleAdsPublishReviewCopy
  confirmed: boolean
  onConfirmedChange: (confirmed: boolean) => void
}) {
  const listSection = (label: string, items: string[]) => (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-medium">{label}</h4>
      {items.length > 0 ? (
        <ul className="list-inside list-disc break-words text-sm leading-relaxed text-muted-foreground">
          {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{copy.notSpecified}</p>}
    </div>
  )

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
      aria-labelledby="google-ads-publish-review-title"
    >
      <header className="flex flex-col gap-1">
        <h3 id="google-ads-publish-review-title" className="text-base font-semibold text-foreground">{copy.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{copy.account}</dt>
          <dd className="break-words font-medium text-foreground">{details.account}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{copy.campaign}</dt>
          <dd className="break-words font-medium text-foreground">{details.campaign}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{copy.finalUrl}</dt>
          <dd className="break-all font-medium text-foreground">{details.finalUrl}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{copy.targeting}</dt>
          <dd className="break-words font-medium text-foreground">{details.targeting}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{copy.dailyBudget}</dt>
          <dd className="font-medium text-foreground">{details.dailyBudget}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{copy.cpcCeiling}</dt>
          <dd className="font-medium text-foreground">{details.cpcCeiling}</dd>
        </div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        {listSection(copy.keywords, details.keywords)}
        {listSection(copy.negativeKeywords, details.negativeKeywords)}
        {listSection(copy.headlines, details.headlines)}
        {listSection(copy.descriptions, details.descriptions)}
      </div>

      <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">
        <p className="text-foreground">{copy.pausedNote}</p>
        <p className="text-muted-foreground">{copy.budgetDisclosure}</p>
        <p className="text-muted-foreground">{copy.billingNote}</p>
        <p className="text-muted-foreground">{copy.creditsNote}</p>
      </div>

      <p className="flex flex-wrap gap-x-2 text-sm">
        <Link className="text-primary underline underline-offset-4" href="/yasal/kullanim-kosullari">{copy.termsLink}</Link>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <Link className="text-primary underline underline-offset-4" href="/yasal/gizlilik-politikasi">{copy.privacyLink}</Link>
      </p>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold text-foreground">{copy.consentLegend}</legend>
        <label htmlFor="google-ads-publish-final-confirmation" className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
          <input
            id="google-ads-publish-final-confirmation"
            type="checkbox"
            checked={confirmed}
            required
            onChange={(event) => onConfirmedChange(event.target.checked)}
            className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
          />
          <span>{copy.consentText}</span>
        </label>
      </fieldset>
    </section>
  )
}
