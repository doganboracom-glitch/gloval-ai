'use client'

import { useId, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { PlanCode } from '@/lib/pricing-config'
import {
  SOCIAL_LABELS,
  SOCIAL_NETWORKS,
  canUseSocialLinks,
  normalizeSocialInput,
  type SocialNetwork,
} from '@/lib/social-links'
import { UpgradeModal } from '@/components/pricing/upgrade-modal'

const PLACEHOLDERS: Record<SocialNetwork, string> = {
  instagram: '@kullaniciadi veya instagram.com/kullaniciadi',
  facebook: 'facebook.com/sayfaadi',
  x: '@kullaniciadi',
  linkedin: 'linkedin.com/company/firma',
  youtube: '@kanaladi veya youtube.com/@kanaladi',
  tiktok: '@kullaniciadi',
  pinterest: 'pinterest.com/kullaniciadi',
  telegram: '@kullaniciadi veya t.me/kullaniciadi',
  whatsappChannel: 'whatsapp.com/channel/...',
}

function SocialField({
  network,
  value,
  onCommit,
}: {
  network: SocialNetwork
  value: string
  onCommit: (network: SocialNetwork, value: string) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [invalid, setInvalid] = useState(false)
  const dirtyRef = useRef(false)
  if (!dirtyRef.current && !invalid && draft !== value) setDraft(value)

  function commit() {
    dirtyRef.current = false
    if (draft === value) {
      setInvalid(false)
      return
    }
    const result = normalizeSocialInput(network, draft)
    if (result.status === 'invalid') {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onCommit(network, result.status === 'ok' ? result.url : '')
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {SOCIAL_LABELS[network]}
      </label>
      <input
        id={id}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        placeholder={PLACEHOLDERS[network]}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(e) => {
          dirtyRef.current = true
          setDraft(e.target.value)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary ${
          invalid ? 'border-destructive' : 'border-border'
        }`}
      />
      {invalid ? (
        <span id={`${id}-error`} role="alert" className="text-[11px] leading-snug text-destructive">
          {SOCIAL_LABELS[network]} için geçerli bir kullanıcı adı veya https bağlantısı girin.
        </span>
      ) : null}
    </div>
  )
}

/**
 * Manual social media links. Open on STARTER and above; FREE sees a lock that
 * opens the upgrade modal. The server enforces the same rule on save.
 */
export function SocialLinksFields({
  site,
  planCode,
  onDispatch,
  onBeforeUpgrade,
}: {
  site: WebsiteSchema
  planCode: PlanCode
  onDispatch: (op: EditOperation) => void
  onBeforeUpgrade?: () => Promise<boolean>
}) {
  const [locked, setLocked] = useState(false)
  const intro =
    'Boş bıraktığınız hesaplar sitede görünmez. Kullanıcı adı ya da profil bağlantısı yazabilirsiniz.'

  if (!canUseSocialLinks(planCode)) {
    return (
      <>
        <p className="text-[11px] leading-snug text-muted-foreground">{intro}</p>
        <button
          type="button"
          onClick={() => setLocked(true)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-xs font-medium text-muted-foreground">Sosyal medya bağlantıları</span>
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        <UpgradeModal
          featureKey={locked ? 'social' : null}
          onClose={() => setLocked(false)}
          linkPrefix="/"
          onBeforeUpgrade={onBeforeUpgrade}
        />
      </>
    )
  }

  const social = site.social

  return (
    <>
      <p className="text-[11px] leading-snug text-muted-foreground">{intro}</p>
      {SOCIAL_NETWORKS.map((network) => (
        <SocialField
          key={network}
          network={network}
          value={social?.[network] ?? ''}
          onCommit={(n, v) => onDispatch({ op: 'updateSocialLinks', patch: { [n]: v } })}
        />
      ))}
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium">Üst menüde de göster</span>
        <input
          type="checkbox"
          checked={social?.showInHeader === true}
          onChange={(e) =>
            onDispatch({ op: 'updateSocialLinks', patch: {}, showInHeader: e.target.checked })
          }
          className="h-4 w-4 accent-primary"
        />
      </label>
    </>
  )
}
