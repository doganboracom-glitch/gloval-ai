import type { DnsRecord } from '@/lib/custom-domains/types'

/**
 * Display-only copy for the e-mail DNS table. Kept apart from the shared
 * `domains` dictionary on purpose: these strings only describe how to read the
 * table (record type vs. role, host notes, registrar steps) and carry no
 * verification logic. Turkish is the product's primary language; every other
 * locale falls back to English.
 */
export type EmailDnsCopy = {
  priority: string
  hostRoot: string
  hostNoSuffix: string
  roles: Record<'SPF' | 'DKIM' | 'DMARC', string>
  stepsTitle: string
  steps: string[]
}

const TR: EmailDnsCopy = {
  priority: 'Öncelik',
  hostRoot: 'Kök alan adı (boş bırakılabilir)',
  hostNoSuffix: 'Alan adınızı sonuna eklemeyin, panel kendisi ekler',
  roles: {
    SPF: 'SPF – gönderen doğrulama',
    DKIM: 'DKIM – imza anahtarı',
    DMARC: 'DMARC – politika',
  },
  stepsTitle: 'Kayıtları alan adı sağlayıcınızda ekleyin',
  steps: [
    'Alan adını satın aldığınız firmanın DNS yönetimi bölümünü açın.',
    'Yukarıdaki dört kaydı ekleyin. SPF, DKIM ve DMARC kayıtlarını "TXT" türünde ekleyin. SPF diye ayrı bir tür aramayın.',
    'Değerleri tırnak işareti olmadan, tam olarak kopyalayıp yapıştırın. DKIM değeri uzundur, araya boşluk veya satır sonu girmesin.',
    'Alan adında zaten bir SPF kaydı (v=spf1 ile başlayan TXT) varsa yenisini eklemeyin, mevcut olanı sayfadaki değerle değiştirin. Bir alan adında yalnızca bir SPF kaydı olabilir.',
    'Alan adında eski MX kayıtları varsa silin, aksi halde e-postalar eski sunucuya gidebilir.',
    'Kaydettikten sonra birkaç dakika bekleyip "E-posta DNS kayıtlarını doğrula" düğmesine basın.',
  ],
}

const EN: EmailDnsCopy = {
  priority: 'Priority',
  hostRoot: 'Root domain (may be left empty)',
  hostNoSuffix: 'Do not append your domain name, the panel adds it for you',
  roles: {
    SPF: 'SPF – sender verification',
    DKIM: 'DKIM – signing key',
    DMARC: 'DMARC – policy',
  },
  stepsTitle: 'Add the records at your domain provider',
  steps: [
    'Open the DNS management section of the company you bought the domain from.',
    'Add the four records above. Add the SPF, DKIM and DMARC records as type "TXT". Do not look for a separate SPF type.',
    'Copy and paste the values exactly, without quotation marks. The DKIM value is long; make sure no spaces or line breaks creep in.',
    'If the domain already has an SPF record (a TXT record starting with v=spf1), do not add a new one; replace the existing one with the value shown on this page. A domain can only have one SPF record.',
    'Delete any old MX records on the domain, otherwise e-mail may still go to the old server.',
    'After saving, wait a few minutes and press the "Verify e-mail DNS records" button.',
  ],
}

export function getEmailDnsCopy(lang: string): EmailDnsCopy {
  return lang === 'tr' ? TR : EN
}

/** Helper note shown next to a host value, or null when none applies. */
export function hostNoteFor(record: DnsRecord, copy: EmailDnsCopy): string | null {
  if (record.host === '@') return copy.hostRoot
  if (record.label === 'DKIM' || record.label === 'DMARC' || /_domainkey|^_dmarc/.test(record.host)) {
    return copy.hostNoSuffix
  }
  return null
}
