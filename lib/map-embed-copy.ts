type Copy = {
  show: string
  privacy: string
  loading: string
  directions: string
  iframeTitle: string
  fieldLabel: string
  fieldPlaceholder: string
  add: string
  adding: string
  remove: string
  connected: string
  stepsTitle: string
  steps: [string, string, string]
  example: string
  errors: {
    invalid: string
    unsafe: string
    wrongDomain: string
    unsupportedLink: string
    shortLink: string
    unauthorized: string
    generic: string
  }
}

const TR: Copy = {
  show: 'Haritayı göster',
  privacy:
    'Harita Google tarafından sağlanır. Göster’e tıkladığınızda Google ile bağlantı kurulur ve çerez kullanabilir.',
  loading: 'Harita yükleniyor…',
  directions: 'Yol tarifi al',
  iframeTitle: 'Konum haritası',
  fieldLabel: 'Google Harita kodu veya bağlantısı',
  fieldPlaceholder: '<iframe src="https://www.google.com/maps/embed?pb=..." ...></iframe>',
  add: 'Haritayı ekle',
  adding: 'Kontrol ediliyor…',
  remove: 'Haritayı kaldır',
  connected: 'Harita eklendi',
  stepsTitle: 'Nasıl eklenir?',
  steps: [
    'Google Haritalar’da işletmenizi açın ve “Paylaş” düğmesine basın.',
    '“Harita yerleştir” sekmesinde “HTML’yi kopyala” düğmesine basın.',
    'Kopyaladığınız kodun tamamını buraya yapıştırıp “Haritayı ekle”ye basın.',
  ],
  example: 'Örnek: <iframe src="https://www.google.com/maps/embed?pb=!1m18..." width="600" height="450"></iframe>',
  errors: {
    invalid: 'Bu içerikte bir harita bulunamadı. Google Haritalar’daki “HTML’yi kopyala” kodunu yapıştırın.',
    unsafe: 'Güvenlik nedeniyle bu içerik kabul edilmedi. Yalnızca Google Haritalar’ın verdiği iframe kodunu yapıştırın.',
    wrongDomain: 'Yalnızca Google Haritalar kabul edilir (google.com/maps).',
    unsupportedLink:
      'Bu bağlantıdan harita oluşturulamadı. “Paylaş → Harita yerleştir → HTML’yi kopyala” yolunu kullanın.',
    shortLink:
      'Kısa bağlantı çözülemedi. Haritalar’da “Paylaş → Haritayı yerleştir → HTML’yi kopyala” yolunu kullanın.',
    unauthorized: 'Oturumunuz kapanmış görünüyor. Sayfayı yenileyip tekrar deneyin.',
    generic: 'Harita eklenemedi. Lütfen tekrar deneyin.',
  },
}

const EN: Copy = {
  show: 'Show map',
  privacy: 'The map is provided by Google. Clicking Show connects to Google, which may set cookies.',
  loading: 'Loading map…',
  directions: 'Get directions',
  iframeTitle: 'Location map',
  fieldLabel: 'Google Maps embed code or link',
  fieldPlaceholder: '<iframe src="https://www.google.com/maps/embed?pb=..." ...></iframe>',
  add: 'Add map',
  adding: 'Checking…',
  remove: 'Remove map',
  connected: 'Map added',
  stepsTitle: 'How to add it',
  steps: [
    'Open your business in Google Maps and press “Share”.',
    'On the “Embed a map” tab, press “COPY HTML”.',
    'Paste the whole code here and press “Add map”.',
  ],
  example: 'Example: <iframe src="https://www.google.com/maps/embed?pb=!1m18..." width="600" height="450"></iframe>',
  errors: {
    invalid: 'No map found in this content. Paste the “COPY HTML” code from Google Maps.',
    unsafe: 'This content was rejected for security reasons. Paste only the iframe code Google Maps gives you.',
    wrongDomain: 'Only Google Maps is accepted (google.com/maps).',
    unsupportedLink: 'A map could not be built from this link. Use “Share → Embed a map → COPY HTML”.',
    shortLink: 'The short link could not be resolved. Use “Share → Embed a map → COPY HTML” in Google Maps.',
    unauthorized: 'Your session seems to have ended. Refresh the page and try again.',
    generic: 'The map could not be added. Please try again.',
  },
}

export function mapCopy(lang: string): Copy {
  return lang === 'tr' ? TR : EN
}
