import {
  getIyzicoApplicationOverview,
  setIyzicoApplicationMarker,
  submitIyzicoApplicationRequest,
} from '@/lib/iyzico-application'
import {
  APPLICATION_DOCUMENTS,
  APPLICATION_LIMITS,
  IYZICO_APPLY_URL,
} from '@/lib/iyzico-application-shared'
import {
  saveIyzicoSettings,
  testIyzicoConnectionAction,
  type IyzicoSettingsView,
} from '@/lib/store-payments/iyzico-settings'
import { IYZICO_ENVIRONMENT_LABELS, IYZICO_ENVIRONMENTS } from '@/lib/store-payments/iyzico-constants'
import type { ProviderSettingsView, ProviderSetupConfig } from '@/lib/payment-providers/types'
import { IyzicoInstantCard, useIyzicoInstantPrefill } from '@/components/ecommerce/iyzico-instant-card'

function toSettings(view: IyzicoSettingsView): ProviderSettingsView {
  return {
    environment: view.environment,
    keysPresent: { apiKey: view.apiKeyPresent, secretKey: view.secretKeyPresent },
    tested: view.tested,
    unreadable: view.unreadable,
    callbackUrl: view.returnUrl,
  }
}

function useInstantEnabled(projectId: string): boolean | undefined {
  return useIyzicoInstantPrefill(projectId).data?.enabled
}

export const iyzicoProvider: ProviderSetupConfig = {
  id: 'iyzico',
  name: 'iyzico',

  copy: {
    intro: {
      tr: 'Kart ödemesi almak için iyzico\u2019da kendi üye işyeri hesabını açarsın. Adımları sırayla takip et.',
      en: 'To accept card payments you open your own iyzico merchant account. Follow the steps in order.',
    },
    prepareDescription: {
      tr: 'iyzico, başvuruda yayındaki siteni inceler. Aşağıdaki kontroller siteni canlı olarak denetler.',
      en: 'iyzico reviews your live site when you apply. These checks audit your site live.',
    },
    applyDescription: {
      tr: 'Başvuruyu iyzico\u2019nun sitesinde sen yaparsın. Hazır bulundurman gerekenler:',
      en: 'You apply on iyzico\u2019s own website. Have these ready:',
    },
    applyLabel: { tr: 'iyzico\u2019da başvur', en: 'Apply at iyzico' },
    applyManualLabel: { tr: 'veya iyzico.com üzerinden başvur', en: 'or apply on iyzico.com' },
    keysDescription: {
      tr: 'iyzico hesabın açılınca panelden API ve gizli anahtarını alıp buraya gir. Kart ödemeleri doğrudan kendi iyzico hesabına gider.',
      en: 'Once your iyzico account is open, copy the API and secret key from its panel and enter them here. Card payments go straight to your own iyzico account.',
    },
    callbackLabel: { tr: "Dönüş URL'si", en: 'Return URL' },
    callbackHint: {
      tr: 'Bu adres her ödemede otomatik kullanılır. iyzico panelinde ayrıca tanımlamanız gerekmez, gerekirse buradan kopyalayın.',
      en: 'This address is used automatically on every payment. You do not need to register it in iyzico; copy it here if you need it.',
    },
  },

  readiness: {
    labels: {
      published: { tr: 'Site yayında', en: 'Site is published' },
      reachable: { tr: 'Site adresi erişilebilir', en: 'Site address is reachable' },
      https: { tr: 'Adres https ile açılıyor', en: 'Address opens over https' },
      privacy: { tr: 'Gizlilik Politikası sayfası', en: 'Privacy Policy page' },
      about: { tr: 'Hakkımızda bölümü', en: 'About section' },
      contact: { tr: 'İletişim bölümü (dolu bilgilerle)', en: 'Contact section (filled in)' },
      delivery: { tr: 'Teslimat ve İade sayfası', en: 'Delivery & Returns page' },
      distance: { tr: 'Mesafeli Satış Sözleşmesi sayfası', en: 'Distance Sales Agreement page' },
      footer: { tr: 'Alt bilgide iyzico, Mastercard ve Visa logoları', en: 'iyzico, Mastercard and Visa logos in the footer' },
    },
    problems: {
      not_published: { tr: 'Önce siteyi yayınla.', en: 'Publish the site first.' },
      unreachable: { tr: 'Adrese ulaşılamadı. Yayını kontrol edip yeniden dene.', en: 'The address could not be reached. Check publishing and retry.' },
      not_https: { tr: 'Adres https ile açılmıyor.', en: 'The address does not open over https.' },
      missing: { tr: 'Bulunamadı.', en: 'Not found.' },
      hidden: { tr: 'Gizlenmiş; görünür yap.', en: 'Hidden; make it visible.' },
      empty: { tr: 'İçerik boş veya çok kısa.', en: 'Content is empty or too short.' },
      placeholder: { tr: 'Yer tutucu (ör. [Adres]) kalmış; gerçek bilgiyle doldur.', en: 'Placeholder text (e.g. [Address]) remains; fill in real details.' },
      footer_hidden: { tr: 'Alt bilgi bölümü gizli; görünür yap.', en: 'The footer section is hidden; make it visible.' },
      unchecked: { tr: 'Önceki adım tamamlanınca kontrol edilir.', en: 'Checked once the previous step is done.' },
    },
    fixes: {
      publish: { hint: { tr: 'Editörün üst çubuğundaki Yayınla düğmesini kullan.', en: 'Use the Publish button in the editor header.' }, opensDesign: false },
      legal: { hint: { tr: 'Tasarım sekmesi, Yasal metinler bölümü.', en: 'Design tab, Legal texts section.' }, opensDesign: true },
      sections: { hint: { tr: 'Tasarım sekmesi, ilgili bölümün alanları.', en: 'Design tab, the section\u2019s fields.' }, opensDesign: true },
      footer: { hint: { tr: 'Tasarım sekmesi, Alt bilgi bölümü.', en: 'Design tab, Footer section.' }, opensDesign: true },
    },
  },

  documents: APPLICATION_DOCUMENTS.map((doc) => ({ key: doc.key, label: { tr: doc.tr, en: doc.en } })),
  apply: {
    manualUrl: IYZICO_APPLY_URL,
    instant: { useEnabled: useInstantEnabled, Form: IyzicoInstantCard },
  },
  help: {
    submit: (projectId, input, consent) => submitIyzicoApplicationRequest(projectId, input, consent),
    errors: {
      invalid_name: { tr: 'Ad ve soyadı birlikte yaz.', en: 'Enter first and last name.' },
      invalid_email: { tr: 'Geçerli bir e-posta yaz.', en: 'Enter a valid e-mail.' },
      invalid_phone: { tr: 'Geçerli bir cep telefonu yaz (ör. 0532 000 00 00).', en: 'Enter a valid mobile number (e.g. 0532 000 00 00).' },
      consent_required: { tr: 'Devam etmek için onay kutusunu işaretle.', en: 'Tick the consent box to continue.' },
      site_not_published: { tr: 'Talep için sitenin yayında olması gerekir.', en: 'Your site must be published first.' },
      rate_limited: {
        tr: `24 saat içinde en fazla ${APPLICATION_LIMITS.perUser} talep gönderilebilir. Daha sonra tekrar dene.`,
        en: `At most ${APPLICATION_LIMITS.perUser} requests can be sent per 24 hours. Try again later.`,
      },
      unavailable: { tr: 'Talep şu an gönderilemedi. Biraz sonra tekrar dene.', en: 'The request could not be sent right now. Try again shortly.' },
    },
  },

  keys: {
    fields: [
      { key: 'apiKey', label: { tr: 'API Key', en: 'API Key' } },
      { key: 'secretKey', label: { tr: 'Secret Key', en: 'Secret Key' } },
    ],
    environments: IYZICO_ENVIRONMENTS.map((id) => ({ id, label: IYZICO_ENVIRONMENT_LABELS[id] })),
    liveEnvironment: 'live',
    async save(projectId, { keys, environment }) {
      const res = await saveIyzicoSettings(projectId, {
        apiKey: keys.apiKey ?? '',
        secretKey: keys.secretKey ?? '',
        environment,
      })
      return res.ok ? { ok: true, settings: toSettings(res.view) } : { ok: false, error: res.error }
    },
    async test(projectId) {
      const res = await testIyzicoConnectionAction(projectId)
      if (res.ok) return { ok: true, settings: toSettings(res.view) }
      return { ok: false, error: res.error, settings: res.view ? toSettings(res.view) : undefined }
    },
    errors: {
      invalid_environment: { tr: 'Geçersiz ortam.', en: 'Invalid environment.' },
      missing_keys: { tr: 'API Key ve Secret Key gerekli.', en: 'API Key and Secret Key are required.' },
      invalid_keys: { tr: 'Anahtar biçimi geçersiz.', en: 'The key format is invalid.' },
      secrets_unreadable: { tr: 'Kayıtlı anahtarlar okunamadığı için kaydedilemedi.', en: 'Saved keys could not be read, so nothing was saved.' },
      save_failed: { tr: 'Ayarlar kaydedilemedi. Lütfen tekrar deneyin.', en: 'Settings could not be saved. Please try again.' },
      not_configured: { tr: 'Önce API Key ve Secret Key kaydedin.', en: 'Save the API Key and Secret Key first.' },
      unreadable: { tr: 'Kayıtlı anahtarlar okunamadı. Anahtarları yeniden girin.', en: 'Saved keys could not be read. Enter the keys again.' },
      auth: {
        tr: 'API Key veya Secret Key hatalı. Sandbox anahtarı canlı ortamda (ya da tersi) çalışmaz; ortam seçimini de kontrol edin.',
        en: 'API Key or Secret Key is wrong. A sandbox key does not work in live (or the reverse); check the environment too.',
      },
      rejected: { tr: 'iyzico isteği reddetti. Hesabınızın bu ortam için etkin olduğunu kontrol edin.', en: 'iyzico rejected the request. Check that your account is active for this environment.' },
      unavailable: { tr: 'iyzico şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.', en: 'iyzico is not reachable right now. Please try again shortly.' },
      rate_limited: { tr: 'Çok fazla deneme yaptınız. Lütfen bir dakika sonra tekrar deneyin.', en: 'Too many attempts. Please try again in a minute.' },
    },
  },

  async loadOverview(projectId) {
    const data = await getIyzicoApplicationOverview(projectId)
    return {
      readiness: data.items.map((item) => ({ id: item.id, ok: item.ok, problem: item.problem, fix: item.fix })),
      siteUrl: data.siteUrl,
      state: data.state,
      help: { enabled: data.formEnabled, prefill: data.prefill },
      settings: toSettings(data.iyzico),
    }
  },

  async setMarker(projectId, marker, value) {
    const result = await setIyzicoApplicationMarker(projectId, marker, value)
    return result.ok && result.state ? { ok: true, state: result.state } : { ok: false }
  },
}
