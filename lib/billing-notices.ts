/**
 * Copy and dedupe keys for subscription lifecycle emails. Every notice is keyed
 * by the subscription AND the billing period it concerns, so a given lifecycle
 * event is delivered at most once, while the next cycle (after a renewal moves
 * `current_period_end`) gets fresh keys.
 */

export type LifecycleNoticeKind = 'past_due' | 'grace_warning' | 'suspended'

export type LifecycleNotice = {
  type: string
  subject: string
  body: string
  dedupeKey: string
}

// Lands on the billing page's renewal card, whose button starts the secure
// renewSubscription() checkout. No payment URL is ever embedded in an email.
const BILLING_PATH = '/billing?renew=1#renew'

function billingUrl() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://gloval.ai').replace(/\/$/, '')
  return `${base}${BILLING_PATH}`
}

export function buildLifecycleNotice(
  kind: LifecycleNoticeKind,
  input: { subscriptionId: string; periodEnd: string | null; graceEndsAt?: Date | null },
): LifecycleNotice {
  const cycle = `${input.subscriptionId}:${input.periodEnd ?? 'none'}`
  const link = billingUrl()

  if (kind === 'past_due') {
    const grace = input.graceEndsAt ? ` Hizmetleriniz ${input.graceEndsAt.toLocaleDateString('tr-TR')} tarihine kadar geçici olarak aktif tutuluyor.` : ''
    return {
      type: 'renewal_payment_failed',
      subject: 'Ödemeniz alınamadı',
      body: `Abonelik yenileme ödemeniz alınamadı.${grace} Siteleriniz yayından kalkmadan önce ödemeyi tamamlayın: ${link}`,
      dedupeKey: `lifecycle:past_due:${cycle}`,
    }
  }
  if (kind === 'grace_warning') {
    const when = input.graceEndsAt ? ` (${input.graceEndsAt.toLocaleDateString('tr-TR')})` : ''
    return {
      type: 'renewal_final_warning',
      subject: 'Son ödeme uyarısı',
      body: `Ödeme süreniz yakında doluyor${when}. Ödeme yapılmazsa siteleriniz yayından kaldırılacak. Şimdi ödeyin: ${link}`,
      dedupeKey: `lifecycle:grace_warning:${cycle}`,
    }
  }
  return {
    type: 'subscription_suspended',
    subject: 'Siteleriniz yayından kaldırıldı',
    body: `Ödeme alınamadığı için abonelikteki siteleriniz yayından kaldırıldı. İçerikleriniz silinmedi; ödemeyi tamamladığınızda siteleriniz yeniden yayına alınır: ${link}`,
    dedupeKey: `lifecycle:suspended:${cycle}`,
  }
}
