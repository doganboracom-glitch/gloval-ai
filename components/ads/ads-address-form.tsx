'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { ADS_DASHBOARD_PATH } from '@/lib/ads/feature-flag'
import { MAX_SITE_ADDRESS_LENGTH, normalizeSiteAddress } from '@/lib/ads/normalize-site-address'

export function AdsAddressForm() {
  const { t } = useLanguage()
  const copy = t.ads
  const router = useRouter()
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = normalizeSiteAddress(value)
    if (!result.ok) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    router.push(`${ADS_DASHBOARD_PATH}?url=${encodeURIComponent(result.host)}`)
  }

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-xl">
      <label htmlFor="ads-address" className="sr-only">
        {copy.addressLabel}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="ads-address"
          name="address"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={MAX_SITE_ADDRESS_LENGTH}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            if (invalid) setInvalid(false)
          }}
          placeholder={copy.addressPlaceholder}
          aria-invalid={invalid}
          aria-describedby="ads-address-hint"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand aria-[invalid=true]:border-destructive"
        />
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-base font-medium text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {copy.addressSubmit}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p
        id="ads-address-hint"
        role={invalid ? 'alert' : undefined}
        className={invalid ? 'mt-3 text-sm text-destructive' : 'mt-3 text-sm text-muted-foreground'}
      >
        {invalid ? copy.addressInvalid : copy.addressHint}
      </p>
    </form>
  )
}
