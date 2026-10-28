const LABELS = {
  tr: {
    pending: 'Beklemede',
    paid: 'Ödendi',
    failed: 'Başarısız',
    refunded: 'İade edildi',
    abandoned: 'Tamamlanmadı',
  },
  en: {
    pending: 'Pending',
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    abandoned: 'Not completed',
  },
} as const

/** Owner-facing payment status text; never the raw database value for known states. */
export function paymentStatusLabel(status: string | null | undefined, language: 'tr' | 'en' = 'tr'): string {
  const key = (status ?? '').trim().toLowerCase()
  const table = LABELS[language]
  if (key in table) return table[key as keyof typeof table]
  return language === 'en' ? 'Unknown' : 'Bilinmiyor'
}
