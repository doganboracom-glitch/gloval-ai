'use client'

import { useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABEL,
  isBusinessType,
  validateCompanyField,
  type CompanyField,
} from '@/lib/company-profile'
import { companyFieldOperation, SELLER_WARNING_TEXT, storeSellerGaps } from '@/lib/legal-editor'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { CompanyProfile, WebsiteSchema } from '@/lib/website-schema'

export const COMPANY_GROUP_ID = 'company-group'

const inputClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary'

/**
 * Text input with a local draft and a LIVE format check. The value is committed
 * on blur even when invalid: the owner never loses what they typed, and the
 * backend treats an invalid value as "not provided" (placeholder in the text).
 */
function CompanyTextField({
  field,
  label,
  value,
  onCommit,
  businessType,
  placeholder,
  hint,
  inputMode,
  multiline = false,
}: {
  field: CompanyField
  label: string
  value: string
  onCommit: (value: string) => void
  businessType?: CompanyProfile['businessType']
  placeholder?: string
  hint?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'url'
  multiline?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const dirtyRef = useRef(false)
  if (!dirtyRef.current && draft !== value) setDraft(value)

  const error = validateCompanyField(field, draft, businessType)
  const errorId = `company-${field}-error`

  const common = {
    value: draft,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      dirtyRef.current = true
      setDraft(e.target.value)
    },
    onBlur: () => {
      dirtyRef.current = false
      if (draft.trim() !== value.trim()) onCommit(draft)
    },
    className: `${inputClass} ${error ? 'border-destructive' : 'border-border'}`,
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea rows={3} {...common} className={`${common.className} resize-none`} />
      ) : (
        <input
          type="text"
          inputMode={inputMode}
          {...common}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      )}
      {error ? (
        <span id={errorId} role="alert" className="text-[11px] leading-snug text-destructive">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[11px] leading-snug text-muted-foreground/80">{hint}</span>
      ) : null}
    </label>
  )
}

/** "Firma bilgileri": the seller details every legal text and checkout reads. */
export function CompanyFields({
  site,
  onDispatch,
}: {
  site: WebsiteSchema
  onDispatch: (op: EditOperation) => void
}) {
  const c = site.company ?? {}
  const commit = (field: CompanyField) => (value: string) => onDispatch(companyFieldOperation(field, value))
  const mersisRequired = c.businessType === 'limited' || c.businessType === 'joint_stock'

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Bu bilgiler sitenizin yasal metinlerinde ve mağaza ödeme sayfasındaki satıcı satırında kullanılır.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">İşletme türü</span>
        <select
          value={c.businessType ?? ''}
          onChange={(e) => onDispatch(companyFieldOperation('businessType', e.target.value))}
          className={`${inputClass} border-border`}
        >
          <option value="">Seçilmedi</option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUSINESS_TYPE_LABEL[type].tr}
            </option>
          ))}
        </select>
      </label>

      <CompanyTextField
        field="tradeName"
        label="Ticari ünvan"
        value={c.tradeName ?? ''}
        onCommit={commit('tradeName')}
        placeholder="Örn. Örnek Giyim Tic. Ltd. Şti."
      />
      <div className="grid grid-cols-2 gap-2">
        <CompanyTextField
          field="taxOffice"
          label="Vergi dairesi"
          value={c.taxOffice ?? ''}
          onCommit={commit('taxOffice')}
          placeholder="Örn. Kadıköy"
        />
        <CompanyTextField
          field="taxId"
          label="Vergi no / TC kimlik no"
          value={c.taxId ?? ''}
          onCommit={commit('taxId')}
          businessType={isBusinessType(c.businessType) ? c.businessType : undefined}
          inputMode="numeric"
          placeholder="10 veya 11 hane"
        />
      </div>
      <CompanyTextField
        field="mersis"
        label={mersisRequired ? 'MERSİS no' : 'MERSİS no (isteğe bağlı)'}
        value={c.mersis ?? ''}
        onCommit={commit('mersis')}
        inputMode="numeric"
        placeholder="16 haneli"
        hint={mersisRequired ? 'Limited ve anonim şirketler için zorunludur.' : undefined}
      />
      <div className="grid grid-cols-2 gap-2">
        <CompanyTextField field="city" label="Şehir" value={c.city ?? ''} onCommit={commit('city')} />
        <CompanyTextField
          field="district"
          label="İlçe"
          value={c.district ?? ''}
          onCommit={commit('district')}
        />
      </div>
      <CompanyTextField
        field="addressLine"
        label="Adres"
        value={c.addressLine ?? ''}
        onCommit={commit('addressLine')}
        multiline
        placeholder="Mahalle, cadde, no, daire"
        hint="Boş bırakırsanız İletişim bölümündeki adres kullanılır."
      />
      <div className="grid grid-cols-2 gap-2">
        <CompanyTextField
          field="phone"
          label="Telefon"
          value={c.phone ?? ''}
          onCommit={commit('phone')}
          inputMode="tel"
          placeholder="0212 555 12 34"
        />
        <CompanyTextField
          field="email"
          label="E-posta"
          value={c.email ?? ''}
          onCommit={commit('email')}
          inputMode="email"
          placeholder="info@firma.com"
        />
      </div>
      <CompanyTextField
        field="tradeRegistryNo"
        label="Ticaret sicil no (isteğe bağlı)"
        value={c.tradeRegistryNo ?? ''}
        onCommit={commit('tradeRegistryNo')}
      />
      <CompanyTextField
        field="kepAddress"
        label="KEP adresi (isteğe bağlı)"
        value={c.kepAddress ?? ''}
        onCommit={commit('kepAddress')}
        inputMode="email"
      />
      <CompanyTextField
        field="website"
        label="Web sitesi (isteğe bağlı)"
        value={c.website ?? ''}
        onCommit={commit('website')}
        inputMode="url"
        placeholder="https://firma.com"
      />
    </div>
  )
}

/**
 * Banner shown at the top of the design tab for stores whose seller details are
 * incomplete. It only warns — selling is never blocked.
 */
export function SellerWarningBanner({ site }: { site: WebsiteSchema }) {
  const gaps = storeSellerGaps(site, site.meta.name)
  if (gaps.length === 0) return null

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug">{SELLER_WARNING_TEXT}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Eksik: {gaps.join(', ')}.</p>
        <button
          type="button"
          onClick={() =>
            document.getElementById(COMPANY_GROUP_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          className="mt-1.5 text-[11px] font-medium text-primary underline underline-offset-2"
        >
          Firma bilgilerine git
        </button>
      </div>
    </div>
  )
}
