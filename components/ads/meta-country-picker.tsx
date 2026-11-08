'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  allMetaCountries,
  countryName,
  filterMetaCountries,
  isDsaCountry,
} from '@/lib/ads/meta-countries'
import { META_COUNTRIES } from '@/lib/ads/meta-publish-plan'

type Props = {
  id: string
  value: string[]
  max: number
  isTr: boolean
  invalid?: boolean
  describedBy?: string
  labelledBy?: string
  onChange: (next: string[]) => void
}

export function MetaCountryPicker({ id, value, max, isTr, invalid, describedBy, labelledBy, onChange }: Props) {
  const t = (tr: string, en: string) => (isTr ? tr : en)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const all = useMemo(() => allMetaCountries(), [])
  const matches = useMemo(() => filterMetaCountries(all, query), [all, query])
  const atLimit = value.length >= max
  const quickCodes = useMemo(() => new Set(META_COUNTRIES.map((country) => country.code)), [])

  const toggle = (code: string, checked: boolean) => {
    if (checked) {
      if (value.includes(code) || value.length >= max || isDsaCountry(code)) return
      onChange([...value, code])
    } else {
      onChange(value.filter((c) => c !== code))
    }
  }

  const extraSelected = value.filter((code) => !quickCodes.has(code))

  return (
    <div
      id={id}
      tabIndex={-1}
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`flex flex-col gap-3 rounded-md p-1 outline-none ${invalid ? 'ring-2 ring-destructive/40' : ''}`}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {META_COUNTRIES.map((country) => (
          <label key={country.code} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.includes(country.code)}
              disabled={!value.includes(country.code) && (atLimit || isDsaCountry(country.code))}
              onCheckedChange={(checked) => toggle(country.code, checked === true)}
            />
            {countryName(country.code)}
          </label>
        ))}
      </div>

      {extraSelected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('Seçilen diğer ülkeler', 'Other selected countries')}>
          {extraSelected.map((code) => {
            const dsa = isDsaCountry(code)
            return (
              <li
                key={code}
                className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs ${
                  dsa ? 'border-destructive/50 text-destructive' : 'border-border text-foreground'
                }`}
              >
                {countryName(code)}
                {dsa && <span className="font-medium">{t(' · AB, yakında', ' · EU, coming soon')}</span>}
                <button
                  type="button"
                  onClick={() => toggle(code, false)}
                  className="inline-flex size-5 items-center justify-center rounded-full hover:bg-muted"
                  aria-label={t(`${countryName(code)} ülkesini kaldır`, `Remove ${countryName(code)}`)}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={`${id}-all`}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          {t('Diğer ülkeler', 'More countries')}
        </button>

        {open && (
          <div id={`${id}-all`} className="flex flex-col gap-2 rounded-md border border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Ülke ara (ör. Azerbaycan)', 'Search countries (e.g. Azerbaijan)')}
                aria-label={t('Ülke ara', 'Search countries')}
                className="pl-8"
              />
            </div>
            <ul className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2" aria-label={t('Ülke listesi', 'Country list')}>
              {matches.length === 0 && (
                <li className="px-1 py-2 text-sm text-muted-foreground">{t('Eşleşen ülke yok.', 'No matching country.')}</li>
              )}
              {matches.map((country) => {
                const selected = value.includes(country.code)
                const dsa = isDsaCountry(country.code)
                const disabled = !selected && (dsa || atLimit)
                return (
                  <li key={country.code}>
                    <label className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${disabled ? 'opacity-60' : 'hover:bg-muted'}`}>
                      <Checkbox
                        checked={selected}
                        disabled={disabled}
                        onCheckedChange={(checked) => toggle(country.code, checked === true)}
                      />
                      <span className="flex-1">{country.name}</span>
                      {dsa && <span className="text-xs text-muted-foreground">{t('AB, yakında', 'EU, soon')}</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          `${value.length}/${max} ülke seçildi. AB/AEA ülkeleri için ek reklam veren bilgisi gerekiyor; bu özellik yakında.`,
          `${value.length}/${max} countries selected. EU/EEA countries need extra advertiser details; coming soon.`,
        )}
      </p>
    </div>
  )
}
