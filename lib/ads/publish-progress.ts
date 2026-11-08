/** Where a Google Ads plan stands on the draft -> approved -> validated -> published path. */

export type PublishStep = 'draft' | 'approved' | 'validated' | 'published'

export const PUBLISH_STEPS: readonly PublishStep[] = ['draft', 'approved', 'validated', 'published']

export type PublishProgressPlan = {
  status: string
  version: number
  approved_version: number | null
  approval_hash: string | null
  validation_hash: string | null
  validated_version: number | null
}

export function derivePublishStep(plan: PublishProgressPlan): PublishStep {
  if (plan.status === 'published' || plan.status === 'reconciling' || plan.status === 'publishing') return 'published'
  if (plan.status === 'draft' || plan.status === 'failed') return 'draft'
  const approved = Boolean(plan.approval_hash) && plan.approved_version === plan.version
  if (!approved) return 'draft'
  const validated = Boolean(plan.validation_hash) && plan.validation_hash === plan.approval_hash && plan.validated_version === plan.version
  return validated ? 'validated' : 'approved'
}

const STEP_LABELS: Record<PublishStep, readonly [string, string]> = {
  draft: ['Taslak', 'Draft'],
  approved: ['Onay', 'Approval'],
  validated: ['Doğrulama', 'Validation'],
  published: ['Yayın', 'Publish'],
}

export function publishStepLabel(step: PublishStep, isTr: boolean): string {
  return STEP_LABELS[step][isTr ? 0 : 1]
}

/** The single most useful next action for the plan; null when nothing is left to do. */
export function nextStepText(plan: PublishProgressPlan, isTr: boolean): string | null {
  if (plan.status === 'reconciling' || plan.status === 'publishing') {
    return isTr ? 'Sonraki adım: Google Ads hesabında kampanyayı kontrol edin; tekrar yayınlamayın.' : 'Next step: check the campaign in Google Ads; do not publish again.'
  }
  switch (derivePublishStep(plan)) {
    case 'draft':
      return isTr ? 'Sonraki adım: Planı onaylayın.' : 'Next step: approve the plan.'
    case 'approved':
      return isTr ? 'Sonraki adım: Google ile yayın öncesi doğrulamayı çalıştırın.' : 'Next step: run the pre-publish check with Google.'
    case 'validated':
      return isTr ? 'Sonraki adım: Yayın öncesi özeti inceleyin ve kampanyayı duraklatılmış oluşturun.' : 'Next step: review the pre-publish summary and create the campaign paused.'
    case 'published':
      return isTr ? 'Sonraki adım: Google incelemesi tamamlanınca kampanyayı Google Ads’te etkinleştirin.' : 'Next step: once Google review is complete, enable the campaign in Google Ads.'
  }
}

/** Splits "Headline. Details." into a bold headline and a supporting line; single sentences have no detail. */
export function splitSuccessMessage(text: string): { title: string; detail: string | null } {
  const match = /^(.+?[.!])\s+(.+)$/.exec(text.trim())
  if (!match) return { title: text.trim(), detail: null }
  return { title: match[1], detail: match[2] }
}

export type PersistedFeedback = { tone: 'success' | 'warning' | 'error'; text: string }

/** What the stored plan state means for the user, so the message survives refreshes and reopening the plan. */
export function persistedFeedback(plan: PublishProgressPlan, isTr: boolean): PersistedFeedback | null {
  if (plan.status === 'reconciling' || plan.status === 'publishing') {
    return {
      tone: 'warning',
      text: isTr
        ? 'Google sonucu belirsiz. Tekrar yayınlamayın; durum incelemeye alındı.'
        : 'Google’s result is uncertain. Do not publish again; the result is being reconciled.',
    }
  }
  if (plan.status === 'failed') {
    return {
      tone: 'error',
      text: isTr
        ? 'Önceki yayın denemesi başarısız oldu. Planı kontrol edip yeniden doğrulayın.'
        : 'The previous publish attempt failed. Review the plan and validate again.',
    }
  }
  switch (derivePublishStep(plan)) {
    case 'published':
      return { tone: 'success', text: isTr ? 'Kampanya Google Ads’te duraklatılmış olarak oluşturuldu.' : 'The campaign was created paused in Google Ads.' }
    case 'validated':
      return {
        tone: 'success',
        text: isTr
          ? 'Google’ın yayın öncesi doğrulaması başarılı. Kampanya henüz oluşturulmadı.'
          : 'Google’s pre-publish check passed. No campaign has been created yet.',
      }
    case 'approved':
      return {
        tone: 'success',
        text: isTr
          ? `Plan v${plan.version} onaylandı. Google Ads’te henüz değişiklik yapılmadı.`
          : `Plan v${plan.version} approved. No Google Ads changes were made yet.`,
      }
    case 'draft':
      return {
        tone: 'success',
        text: plan.version > 1
          ? (isTr
            ? `Plan v${plan.version} kaydedildi; plan değiştiği için yeniden onay ve doğrulama gerekir.`
            : `Plan v${plan.version} saved; because the plan changed, approval and validation are required again.`)
          : (isTr
            ? 'Taslak kaydedildi. Google Ads’te henüz değişiklik yapılmadı.'
            : 'Draft saved. No Google Ads changes were made yet.'),
      }
  }
}
