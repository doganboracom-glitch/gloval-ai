'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/components/language-provider'
import { DataTable, PageHeader, StatusBadge, Td, Th, Tr } from '@/components/admin/admin-ui'
import {
  resolveStuckGoogleAdsPublish,
  type GoogleAdsPublishResolution,
} from '@/app/admin/ads-publishing/actions'
import type {
  StuckGoogleAdsPublish,
  StuckGoogleAdsPublishList,
} from '@/lib/admin/google-ads-publish-recovery'

const CAMPAIGN_ID_PATTERN = /^\d{1,20}$/

function errorMessage(code: string, isTurkish: boolean): string {
  const messages: Record<string, { tr: string; en: string }> = {
    disabled: { tr: 'Yayın kurtarma özelliği kapalı.', en: 'Publish recovery is disabled.' },
    invalid_request: { tr: 'İstek doğrulanamadı.', en: 'The request could not be validated.' },
    invalid_campaign_id: { tr: '1–20 haneli kampanya kimliği girin.', en: 'Enter a 1–20 digit campaign ID.' },
    not_reconciling: { tr: 'Yayın artık takılı durumda değil. Listeyi yenileyin.', en: 'This publish is no longer pending recovery. Refresh the list.' },
    reservation_missing: { tr: 'Kredi ayırma kaydı bulunamadı.', en: 'The credit reservation was not found.' },
    legacy_charge_missing: { tr: 'Eski yayın için kredi kaydı bulunamadı.', en: 'The legacy publish charge was not found.' },
    insufficient_credits: { tr: 'Kredi durumu doğrulanamadı.', en: 'The credit state could not be verified.' },
    reservation_not_recoverable: { tr: 'Kredi ayırması kurtarılamıyor.', en: 'The reservation cannot be recovered.' },
    resolution_failed: { tr: 'Yayın durumu güncellenemedi.', en: 'The publish state could not be updated.' },
  }
  const message = messages[code] ?? messages.resolution_failed
  return isTurkish ? message.tr : message.en
}

function RecoveryRow({ row, isTurkish }: { row: StuckGoogleAdsPublish; isTurkish: boolean }) {
  const router = useRouter()
  const [campaignId, setCampaignId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const validCampaignId = CAMPAIGN_ID_PATTERN.test(campaignId.trim())
  const requestId = row.publish_request_id

  function resolve(resolution: GoogleAdsPublishResolution) {
    const normalizedCampaignId = campaignId.trim()
    if (resolution === 'published' && !validCampaignId) {
      setMessage(errorMessage('invalid_campaign_id', isTurkish))
      return
    }
    if (!requestId) {
      setMessage(isTurkish ? 'Yayın isteği kimliği eksik.' : 'The publish request ID is missing.')
      return
    }

    const confirmation = resolution === 'published'
      ? isTurkish
        ? `Kampanya ${normalizedCampaignId} yayınlandı olarak işaretlensin mi? Bu işlem denetim kaydına yazılacak.`
        : `Mark campaign ${normalizedCampaignId} as published? This will be written to the audit log.`
      : isTurkish
        ? 'Kampanyanın oluşturulmadığını doğruluyor ve ayrılmış krediyi iade etmek istiyor musunuz? Bu işlem denetim kaydına yazılacak.'
        : 'Confirm that no campaign was created and return the reserved credits? This will be written to the audit log.'

    if (!window.confirm(confirmation)) return
    setMessage(null)
    startTransition(async () => {
      const result = await resolveStuckGoogleAdsPublish({
        planId: row.id,
        requestId,
        resolution,
        campaignId: resolution === 'published' ? normalizedCampaignId : undefined,
        confirmed: true,
      })
      if (!result.ok) {
        setMessage(errorMessage(result.error, isTurkish))
        return
      }

      setMessage(result.state === 'published'
        ? isTurkish ? 'Yayınlandı olarak işaretlendi.' : 'Marked as published.'
        : result.refunded
          ? isTurkish ? 'Yayın başarısız olarak işaretlendi; kredi iade edildi.' : 'Marked as failed; credits were refunded.'
          : isTurkish ? 'Yayın başarısız olarak işaretlendi; bekleyen kredi ayırması serbest bırakıldı.' : 'Marked as failed; the pending credit hold was released.')
      router.refresh()
    })
  }

  return (
    <Tr>
      <Td>
        <p className="font-mono text-xs">{row.id}</p>
        <p className="mt-1 text-xs text-muted-foreground">{isTurkish ? 'Kullanıcı' : 'User'}: {row.user_id}</p>
      </Td>
      <Td>
        <p className="font-mono text-xs">{requestId ?? (isTurkish ? 'Eksik' : 'Missing')}</p>
        {row.failure_reason ? <p className="mt-1 text-xs text-muted-foreground">{row.failure_reason}</p> : null}
      </Td>
      <Td>
        <StatusBadge
          tone={row.status === 'reconciling' ? 'warning' : 'danger'}
          label={row.status === 'reconciling' ? (isTurkish ? 'Uzlaştırılıyor' : 'Reconciling') : (isTurkish ? 'Yayınlanıyor' : 'Publishing')}
        />
      </Td>
      <Td className="whitespace-nowrap text-xs text-muted-foreground">
        {new Intl.DateTimeFormat(isTurkish ? 'tr-TR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
          .format(new Date(row.publish_started_at))}
      </Td>
      <Td>
        <div className="flex min-w-64 flex-col gap-2">
          <FieldGroup className="gap-1.5">
            <Field data-invalid={campaignId.length > 0 && !validCampaignId}>
              <FieldLabel htmlFor={`google-ads-campaign-${row.id}`}>
                {isTurkish ? 'Kampanya kimliği gir' : 'Enter campaign ID'}
              </FieldLabel>
              <Input
                id={`google-ads-campaign-${row.id}`}
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                aria-invalid={campaignId.length > 0 && !validCampaignId}
                disabled={pending || !requestId}
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={pending || !requestId} onClick={() => resolve('published')}>
              {isTurkish ? 'Yayınlandı olarak işaretle' : 'Mark as published'}
            </Button>
            <Button type="button" size="sm" variant="destructive" disabled={pending || !requestId} onClick={() => resolve('failed_refunded')}>
              {isTurkish ? 'Başarısız say ve krediyi iade et' : 'Mark failed and refund credits'}
            </Button>
          </div>
          {message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}
        </div>
      </Td>
    </Tr>
  )
}

export function GoogleAdsPublishRecoveryView({ list }: { list: StuckGoogleAdsPublishList }) {
  const { lang } = useLanguage()
  const isTurkish = lang === 'tr'
  const copy = isTurkish
    ? {
        title: 'Takılı Google Ads yayınları',
        subtitle: '10 dakikadan uzun süredir tamamlanmamış yayınları inceleyip güvenli biçimde uzlaştırın.',
        disabled: 'Yayın kurtarma özelliği kapalı. Bu ekran veritabanını sorgulamaz veya yayın işlemi başlatmaz.',
        queryError: 'Takılı yayınlar yüklenemedi. Migration uygulandıktan sonra tekrar deneyin.',
        empty: 'Uzlaştırma bekleyen takılı yayın yok.',
        colPlan: 'Plan / kullanıcı',
        colRequest: 'Yayın isteği',
        colStatus: 'Durum',
        colStarted: 'Başlangıç',
        colRecovery: 'Kurtarma eylemi',
      }
    : {
        title: 'Stuck Google Ads publishes',
        subtitle: 'Review and safely reconcile publishes that have not completed after ten minutes.',
        disabled: 'Publish recovery is disabled. This screen will not query the database or start a publish.',
        queryError: 'Stuck publishes could not be loaded. Retry after the migration is applied.',
        empty: 'There are no stuck publishes awaiting reconciliation.',
        colPlan: 'Plan / user',
        colRequest: 'Publish request',
        colStatus: 'Status',
        colStarted: 'Started',
        colRecovery: 'Recovery action',
      }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      {!list.enabled ? (
        <p role="status" className="rounded-xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">{copy.disabled}</p>
      ) : list.error ? (
        <p role="alert" className="rounded-xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">{copy.queryError}</p>
      ) : (
        <DataTable
          isEmpty={list.rows.length === 0}
          empty={copy.empty}
          head={
            <>
              <Th>{copy.colPlan}</Th>
              <Th>{copy.colRequest}</Th>
              <Th>{copy.colStatus}</Th>
              <Th>{copy.colStarted}</Th>
              <Th>{copy.colRecovery}</Th>
            </>
          }
        >
          {list.rows.map((row) => <RecoveryRow key={row.id} row={row} isTurkish={isTurkish} />)}
        </DataTable>
      )}
    </div>
  )
}
