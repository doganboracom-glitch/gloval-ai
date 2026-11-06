import type { GoogleAdsAnalysis } from '@/lib/ads/google-ads-analysis-contract'
import type { GoogleAdsInsightsReport } from '@/lib/ads/google-ads-insights-shared'

export type GoogleAdsReportEmailInput = {
  frequencyLabel: 'Haftalık' | 'Aylık'
  report: GoogleAdsInsightsReport
  analysis: GoogleAdsAnalysis | null
  dashboardUrl: string
  unsubscribeUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(valueMicros: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency ?? 'TRY',
      maximumFractionDigits: 2,
    }).format(valueMicros / 1_000_000)
  } catch {
    return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(valueMicros / 1_000_000)} ${currency ?? 'TRY'}`
  }
}

function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(value)
}

function percentage(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? 'Değişim yok' : 'Önceki dönemde veri yok'
  const value = ((current - previous) / Math.abs(previous)) * 100
  const sign = value > 0 ? '+' : ''
  return `${sign}${number(value, 1)}%`
}

function periodLabel(from: string, to: string): string {
  return `${from} – ${to}`
}

function campaignSummary(report: GoogleAdsInsightsReport): { best: string; needsReview: string } {
  if (report.summary.conversions <= 0) {
    return {
      best: 'Dönüşüm verisi bulunmadığı için kampanya sıralaması yapılmadı.',
      needsReview: 'Dönüşüm ölçümü kurulu değil veya bu dönemde veri alınmadı; verimlilik yorumu yapılmadı.',
    }
  }

  const best = [...report.campaigns]
    .filter((campaign) => campaign.current.conversions > 0)
    .sort((a, b) => b.current.conversions - a.current.conversions)[0]
  const needsReview = [...report.campaigns]
    .filter((campaign) => campaign.current.conversions === 0 && campaign.current.costMicros > 0)
    .sort((a, b) => b.current.costMicros - a.current.costMicros)[0]

  return {
    best: best ? `${best.name} (${number(best.current.conversions, 1)} dönüşüm)` : 'Bu dönemde dönüşüm kaydı bulunamadı.',
    needsReview: needsReview
      ? `${needsReview.name} (${money(needsReview.current.costMicros, report.currency)} harcama, dönüşüm kaydı yok)`
      : 'Dönüşüm getirmeyen kampanya harcaması bulunmadı.',
  }
}

export function buildGoogleAdsReportEmail(input: GoogleAdsReportEmailInput): { subject: string; html: string; text: string } {
  const { report } = input
  const from = report.range.from
  const to = report.range.to
  const campaigns = campaignSummary(report)
  const conversionTrackingMissing = report.summary.conversions <= 0
  const ctr = report.summary.impressions > 0 ? report.summary.clicks / report.summary.impressions * 100 : 0
  const averageCpc = report.summary.clicks > 0 ? report.summary.costMicros / report.summary.clicks : 0
  const cpa = report.summary.conversions > 0 ? report.summary.costMicros / report.summary.conversions : null
  const analysisSummary = input.analysis?.summary ?? 'Bu gönderim için AI özeti üretilemedi. Aşağıdaki metrikler Google Ads hesabından alınmıştır.'
  const recommendations = input.analysis?.recommendations ?? []
  const campaignRows = report.campaigns.slice(0, 5).map((campaign) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #34343d;color:#e7e7ea">${escapeHtml(campaign.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #34343d;color:#e7e7ea;text-align:right">${money(campaign.current.costMicros, report.currency)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #34343d;color:#e7e7ea;text-align:right">${number(campaign.current.conversions, 1)}</td>
    </tr>`).join('')
  const recommendationHtml = recommendations.map((item) => `
    <li style="margin:0 0 10px"><strong>${escapeHtml(item.type.replace(/_/g, ' '))}:</strong> ${escapeHtml(item.recommendedAction)}<br><span style="color:#a7a7b0">${escapeHtml(item.why)}</span></li>`).join('')
  const unsubscribe = escapeHtml(input.unsubscribeUrl)
  const dashboard = escapeHtml(input.dashboardUrl)
  const currentPeriod = periodLabel(from, to)
  const priorPeriod = periodLabel(report.range.previousFrom, report.range.previousTo)
  const comparisonRows = [
    ['Harcama', money(report.summary.costMicros, report.currency), percentage(report.summary.costMicros, report.previous.costMicros)],
    ['Tıklama', number(report.summary.clicks), percentage(report.summary.clicks, report.previous.clicks)],
    ['Dönüşüm', number(report.summary.conversions, 1), percentage(report.summary.conversions, report.previous.conversions)],
  ]
  const comparisonHtml = comparisonRows.map(([label, current, change]) => `
    <tr><td style="padding:9px 12px;border-bottom:1px solid #34343d;color:#c4c4cc">${label}</td><td style="padding:9px 12px;border-bottom:1px solid #34343d;color:#e7e7ea;text-align:right">${current}</td><td style="padding:9px 12px;border-bottom:1px solid #34343d;color:#c4c4cc;text-align:right">${change}</td></tr>`).join('')
  const trackingNote = conversionTrackingMissing
    ? '<p style="padding:12px 14px;border-radius:10px;background:#24242d;color:#e7e7ea"><strong>Dönüşüm ölçümü kurulu değil veya bu dönemde veri yok.</strong> Verimlilik değerlendirmesi yapılmadı. Google Ads dönüşüm eylemlerini ve GLOVAL sitenizdeki Google etiketi / başarılı form ya da sipariş olayını doğrulayın.</p>'
    : ''
  const html = `<!doctype html><html lang="tr"><body style="margin:0;background:#0b0b0f;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#e7e7ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#141419;border:1px solid #26262e;border-radius:16px;overflow:hidden">
      <tr><td style="padding:26px 28px 8px"><div style="font-size:16px;font-weight:700;letter-spacing:.14em;color:#b794ff">GLOVAL ADS</div></td></tr>
      <tr><td style="padding:6px 28px 18px"><h1 style="margin:0;font-size:22px;line-height:1.35;color:#fff">${input.frequencyLabel} Google Ads raporunuz</h1><p style="margin:8px 0 0;color:#a7a7b0">${escapeHtml(currentPeriod)}</p></td></tr>
      <tr><td style="padding:0 28px 22px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#1b1b22;border-radius:12px">
          <tr><td style="padding:14px;color:#a7a7b0">Gösterim</td><td style="padding:14px;color:#fff;text-align:right">${number(report.summary.impressions)}</td><td style="padding:14px;color:#a7a7b0">Tıklama</td><td style="padding:14px;color:#fff;text-align:right">${number(report.summary.clicks)}</td></tr>
          <tr><td style="padding:14px;color:#a7a7b0">CTR</td><td style="padding:14px;color:#fff;text-align:right">${number(ctr, 2)}%</td><td style="padding:14px;color:#a7a7b0">Ort. TBM</td><td style="padding:14px;color:#fff;text-align:right">${money(averageCpc, report.currency)}</td></tr>
          <tr><td style="padding:14px;color:#a7a7b0">Harcama</td><td style="padding:14px;color:#fff;text-align:right">${money(report.summary.costMicros, report.currency)}</td><td style="padding:14px;color:#a7a7b0">Dönüşüm</td><td style="padding:14px;color:#fff;text-align:right">${number(report.summary.conversions, 1)}</td></tr>
          <tr><td style="padding:14px;color:#a7a7b0">Dönüşüm başı maliyet</td><td colspan="3" style="padding:14px;color:#fff;text-align:right">${cpa === null ? '—' : money(cpa, report.currency)}</td></tr>
        </table>
        ${trackingNote}
      </td></tr>
      <tr><td style="padding:0 28px 22px"><h2 style="margin:0 0 10px;font-size:16px;color:#fff">Önceki dönemle karşılaştırma</h2><p style="margin:0 0 8px;color:#a7a7b0">${escapeHtml(priorPeriod)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${comparisonHtml}</table>
      </td></tr>
      <tr><td style="padding:0 28px 22px"><h2 style="margin:0 0 10px;font-size:16px;color:#fff">Kampanya özeti</h2><p style="margin:0 0 8px;color:#c4c4cc"><strong>En iyi:</strong> ${escapeHtml(campaigns.best)}</p><p style="margin:0 0 12px;color:#c4c4cc"><strong>İncelenecek:</strong> ${escapeHtml(campaigns.needsReview)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><thead><tr><th align="left" style="padding:8px 12px;color:#a7a7b0">Kampanya</th><th align="right" style="padding:8px 12px;color:#a7a7b0">Harcama</th><th align="right" style="padding:8px 12px;color:#a7a7b0">Dönüşüm</th></tr></thead><tbody>${campaignRows || '<tr><td colspan="3" style="padding:12px;color:#a7a7b0">Bu dönemde kampanya verisi yok.</td></tr>'}</tbody></table>
      </td></tr>
      <tr><td style="padding:0 28px 22px"><h2 style="margin:0 0 10px;font-size:16px;color:#fff">AI özeti</h2><p style="margin:0;color:#c4c4cc;line-height:1.7">${escapeHtml(analysisSummary)}</p>${recommendationHtml ? `<ul style="padding-left:20px;color:#c4c4cc;line-height:1.6">${recommendationHtml}</ul>` : ''}</td></tr>
      <tr><td style="padding:0 28px 28px"><a href="${dashboard}" style="display:inline-block;padding:12px 16px;border-radius:9px;background:#7652c8;color:#fff;text-decoration:none;font-weight:700">Performans panelini aç</a><p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#8c8c96">Rapor yalnızca izin verdiğiniz Google Ads bağlantısının toplu performans verilerini içerir; hesap kimliği ve erişim bilgileri gösterilmez.</p><p style="margin:10px 0 0;font-size:12px;color:#8c8c96"><a href="${unsubscribe}" style="color:#b8a0ef">E-posta raporlarından çık</a></p></td></tr>
    </table><p style="padding:14px;font-size:11px;color:#6b6b76">© ${new Date().getFullYear()} GLOVAL AI</p>
  </td></tr></table></body></html>`

  const textRecommendations = recommendations.length
    ? `\n\nÖneriler:\n${recommendations.map((item) => `- ${item.recommendedAction} — ${item.why}`).join('\n')}`
    : ''
  const text = [
    `GLOVAL ADS — ${input.frequencyLabel} Google Ads raporunuz`,
    currentPeriod,
    `Gösterim: ${number(report.summary.impressions)}`,
    `Tıklama: ${number(report.summary.clicks)}`,
    `CTR: ${number(ctr, 2)}%`,
    `Ort. TBM: ${money(averageCpc, report.currency)}`,
    `Harcama: ${money(report.summary.costMicros, report.currency)}`,
    `Dönüşüm: ${number(report.summary.conversions, 1)}`,
    `Dönüşüm başı maliyet: ${cpa === null ? '—' : money(cpa, report.currency)}`,
    `Önceki dönem (${priorPeriod}) farkı — Harcama: ${percentage(report.summary.costMicros, report.previous.costMicros)}, tıklama: ${percentage(report.summary.clicks, report.previous.clicks)}, dönüşüm: ${percentage(report.summary.conversions, report.previous.conversions)}`,
    `En iyi kampanya: ${campaigns.best}`,
    `İncelenecek kampanya: ${campaigns.needsReview}`,
    conversionTrackingMissing ? 'Dönüşüm ölçümü kurulu değil veya bu dönemde veri yok; verimlilik yorumu yapılmadı.' : '',
    `AI özeti: ${analysisSummary}${textRecommendations}`,
    `Performans paneli: ${input.dashboardUrl}`,
    `E-posta raporlarından çık: ${input.unsubscribeUrl}`,
  ].filter(Boolean).join('\n')

  return {
    subject: `${input.frequencyLabel} Google Ads raporunuz · ${from} – ${to}`,
    html,
    text,
  }
}
