'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'

type PreferencesResponse = {
  ok: true
  emailConfigured: boolean
  preferences: {
    connectionId: string | null
    weeklyEnabled: boolean
    monthlyEnabled: boolean
  }
}

type ApiErrorPayload = { error?: string }

class PreferencesError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code)
  }
}

async function fetchPreferences(url: string): Promise<PreferencesResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as ApiErrorPayload).error === 'string'
      ? (payload as ApiErrorPayload).error!
      : 'provider_error'
    throw new PreferencesError(code, response.status)
  }
  return payload as PreferencesResponse
}

function getPreferencesError(error: unknown): string {
  if (error instanceof PreferencesError) {
    if (error.status === 503) return 'E-posta raporu tercihleri henüz kullanılamıyor. Lütfen daha sonra tekrar deneyin.'
    if (error.code === 'missing_email' || error.code === 'email_unavailable') return 'Hesabınızda geçerli bir e-posta adresi bulunmuyor.'
    if (error.code === 'reauth_required') return 'Bu Google Ads bağlantısının yeniden yetkilendirilmesi gerekiyor.'
    if (error.code === 'connection_not_found') return 'Seçilen Google Ads hesabına erişilemiyor.'
  }
  return 'Tercihler kaydedilemedi. Tekrar deneyin.'
}

export function GoogleAdsReportSettings({ connectionId }: { connectionId: string }) {
  const endpoint = connectionId
    ? `/api/ads/google/reports?connectionId=${encodeURIComponent(connectionId)}`
    : null
  const { data, error, isLoading, mutate } = useSWR<PreferencesResponse>(endpoint, fetchPreferences, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })
  const [weeklyDraft, setWeeklyDraft] = useState<boolean | null>(null)
  const [monthlyDraft, setMonthlyDraft] = useState<boolean | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (!connectionId) return null

  const weeklyEnabled = weeklyDraft ?? data?.preferences.weeklyEnabled ?? false
  const monthlyEnabled = monthlyDraft ?? data?.preferences.monthlyEnabled ?? false
  const unavailable = Boolean(error)

  async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setSaveError(null)
    setSaved(false)

    try {
      const response = await fetch('/api/ads/google/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, weeklyEnabled, monthlyEnabled }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const code = payload && typeof payload === 'object' && typeof (payload as ApiErrorPayload).error === 'string'
          ? (payload as ApiErrorPayload).error!
          : 'provider_error'
        throw new PreferencesError(code, response.status)
      }

      await mutate(payload as PreferencesResponse, false)
      setWeeklyDraft(null)
      setMonthlyDraft(null)
      setSaved(true)
    } catch (saveFailure) {
      setSaveError(getPreferencesError(saveFailure))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="google-ads-report-settings google-ads-print-hidden">
      <CardHeader>
        <CardTitle>E-posta raporları</CardTitle>
        <CardDescription>
          İsteğe bağlıdır ve varsayılan olarak kapalıdır. Raporlar yalnızca Google Ads hesabınıza ait özet metrikleri içerir.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Tercihler yüklenemedi</AlertTitle>
            <AlertDescription>{getPreferencesError(error)}</AlertDescription>
          </Alert>
        ) : null}
        {data && !data.emailConfigured ? (
          <Alert role="status">
            <AlertTitle>E-posta adresi gerekli</AlertTitle>
            <AlertDescription>Raporları gönderebilmek için hesabınızda geçerli bir e-posta adresi bulunmalıdır.</AlertDescription>
          </Alert>
        ) : null}
        {saveError ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Tercihler kaydedilemedi</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={savePreferences} className="flex flex-col gap-4">
          <FieldSet disabled={isLoading || unavailable || isSaving || data?.emailConfigured === false}>
            <FieldLegend>E-posta gönderim sıklığı</FieldLegend>
            <FieldGroup>
              <Field orientation="horizontal">
                <Checkbox
                  id="google-ads-weekly-report"
                  checked={weeklyEnabled}
                  onCheckedChange={(checked) => setWeeklyDraft(checked === true)}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="google-ads-weekly-report">Haftalık performans raporu</FieldLabel>
                  <FieldDescription>Her pazartesi, tamamlanan son haftanın özeti.</FieldDescription>
                </div>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="google-ads-monthly-report"
                  checked={monthlyEnabled}
                  onCheckedChange={(checked) => setMonthlyDraft(checked === true)}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="google-ads-monthly-report">Aylık performans raporu</FieldLabel>
                  <FieldDescription>Her ayın ilk günü, tamamlanan son ayın özeti.</FieldDescription>
                </div>
              </Field>
            </FieldGroup>
          </FieldSet>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isLoading || unavailable || isSaving || data?.emailConfigured !== true}>
              {isSaving ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}
              Tercihleri kaydet
            </Button>
            <p className="text-sm text-muted-foreground">
              Kayıtlı e-posta adresinize gönderilir; her raporda abonelikten çıkma bağlantısı bulunur.
            </p>
          </div>
        </form>
        {saved ? <p className="text-sm text-muted-foreground" role="status">Rapor e-posta tercihleriniz kaydedildi.</p> : null}
      </CardContent>
    </Card>
  )
}
