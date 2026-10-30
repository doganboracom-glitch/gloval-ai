import { describe, expect, it } from 'vitest'
import { evaluateCopyPolicy, evaluatePolicy, evaluateSnapshotPolicy } from './policy'
import { POLICY_CATEGORIES } from './policy-terms'
import type { SiteSnapshot } from './scan/scan-site'

const snapshot = (overrides: Partial<SiteSnapshot> = {}): SiteSnapshot => ({
  host: 'ornek.com',
  finalHost: 'ornek.com',
  language: 'tr',
  title: 'Ornek',
  description: '',
  siteName: '',
  organizationNames: [],
  headings: [],
  navLabels: [],
  text: '',
  pages: [],
  ...overrides,
})

describe('blocked categories', () => {
  it.each([
    ['adult', 'Ücretsiz porno izle'],
    ['adult', 'Elite escort services in Istanbul'],
    ['weapons', 'Ruhsatsız silah satışı yapılır'],
    ['weapons', 'Buy a gun online, ammunition in stock'],
    ['counterfeit', 'Sahte diploma ve sahte kimlik hazırlanır'],
    ['counterfeit', 'Premium replica watches, fake ID cards'],
    ['drugs', 'Uyuşturucu satışı ve kokain teslimatı'],
    ['drugs', 'buy cocaine, buy weed online'],
    ['prescription_drugs', 'Reçetesiz ilaç ve viagra siparişi'],
    ['gambling', 'Canlı bahis ve kumarhane bonusları'],
    ['gambling', 'Best online casino and sportsbook'],
    ['spyware_hacking', 'Casus yazılım ile WhatsApp hackleme'],
    ['dishonest_practices', 'Takipçi satın al, yorum satın al'],
    ['tobacco', 'Elektronik sigara ve vape çeşitleri'],
    ['tobacco', 'Cheap cigarettes and tobacco products'],
  ])('flags %s in %j', (category, text) => {
    const result = evaluatePolicy({ prominent: [text] })
    expect(result.verdict).toBe('blocked')
    expect(result.blocked).toContain(category)
  })

  it('covers every blocked category with at least one term', () => {
    for (const definition of POLICY_CATEGORIES) expect(definition.terms.length).toBeGreaterThan(0)
  })
})

describe('restricted categories', () => {
  it.each([
    ['alcohol', 'Butik şarap ve rakı koleksiyonu'],
    ['financial', 'Hızlı kredi ve forex eğitimi'],
    ['health', 'Mucize zayıflama kürü ve takviyeler'],
    ['cannabis_cbd', 'CBD yağı ve kenevir ürünleri'],
    ['dating', 'Arkadaşlık sitesi ve dating'],
  ])('flags %s in %j without blocking', (category, text) => {
    const result = evaluatePolicy({ prominent: [text] })
    expect(result.verdict).toBe('restricted')
    expect(result.restricted).toContain(category)
    expect(result.blocked).toEqual([])
  })

  it('blocked wins over restricted', () => {
    const result = evaluatePolicy({ prominent: ['Şarap ve canlı bahis'] })
    expect(result.verdict).toBe('blocked')
    expect(result.restricted).toContain('alcohol')
  })
})

describe('word-boundary matching', () => {
  it('does not fire on short keys inside longer words (the "tur" / "oluştur" class of bug)', () => {
    expect(evaluatePolicy({ body: ['Bir tur şirketi için web sitesi oluştur'], prominent: ['Tur ve seyahat'] }).verdict).toBe(
      'allowed',
    )
  })

  it('does not fire on a stem that is only a prefix of an unrelated word', () => {
    // "silahtar" (a surname), "bira" inside "birazdan", "vape" inside "escapevape"
    expect(evaluatePolicy({ prominent: ['Silahtar Hukuk Bürosu', 'Birazdan görüşürüz'] }).verdict).toBe('allowed')
  })

  it('keeps a very common surname out of the gambling list', () => {
    expect(evaluatePolicy({ prominent: ['Dr. Kumar Sharma Klinik'], body: ['Kumar Sharma'] }).blocked).toEqual([])
  })

  it('matches suffixed forms of starred stems', () => {
    expect(evaluatePolicy({ prominent: ['kumarhaneler'] }).blocked).toContain('gambling')
    expect(evaluatePolicy({ prominent: ['casinolar'] }).blocked).toContain('gambling')
    expect(evaluatePolicy({ prominent: ['tabancalar'] }).blocked).toContain('weapons')
  })

  it('folds Turkish case and diacritics, and compatibility forms', () => {
    expect(evaluatePolicy({ prominent: ['İDDAA KUPONLARI'] }).blocked).toContain('gambling')
    expect(evaluatePolicy({ prominent: ['KUMARHANE'] }).blocked).toContain('gambling')
    expect(evaluatePolicy({ prominent: ['ｃａｓｉｎｏ'] }).blocked).toContain('gambling')
    expect(evaluatePolicy({ prominent: ['Uyuşturucu satışı'] }).blocked).toContain('drugs')
  })

  it('does not treat invisible padding as a word break trick', () => {
    // Invisible characters are stripped by the scanner before policy runs; plain spaces still split words.
    expect(evaluatePolicy({ prominent: ['ca sino'] }).verdict).toBe('allowed')
  })
})

describe('thresholds', () => {
  it('one hit in a prominent field decides', () => {
    expect(evaluatePolicy({ prominent: ['Canlı bahis'] }).verdict).toBe('blocked')
  })

  it('an incidental body mention does not condemn a site, repetition does', () => {
    expect(evaluatePolicy({ body: ['Hukuk bürosu. Uyuşturucu satışı davalarına da bakarız.'] }).verdict).toBe('allowed')
    expect(evaluatePolicy({ body: ['uyuşturucu satışı. uyuşturucu satışı. uyuşturucu satışı.'] }).verdict).toBe('blocked')
  })

  it('restricted body text needs two hits', () => {
    expect(evaluatePolicy({ body: ['Bir kredi seçeneği'] }).verdict).toBe('allowed')
    expect(evaluatePolicy({ body: ['kredi hesaplama ve kredi başvurusu'] }).verdict).toBe('restricted')
  })
})

describe('host names', () => {
  it.each(['canlibahis24.com', 'bestcasino.net', 'ucuz-porno.tv', 'istanbul-escort.com'])('blocks the host %s', (host) => {
    expect(evaluatePolicy({ hosts: [host] }).verdict).toBe('blocked')
  })

  it('leaves ordinary hosts alone', () => {
    expect(evaluatePolicy({ hosts: ['egenakliyat.com', 'olustur.com'] }).verdict).toBe('allowed')
  })
})

describe('evaluateSnapshotPolicy / evaluateCopyPolicy', () => {
  it('checks title, headings, navigation and the host (after redirect too)', () => {
    expect(evaluateSnapshotPolicy(snapshot({ headings: ['Canlı bahis oyna'] })).verdict).toBe('blocked')
    expect(evaluateSnapshotPolicy(snapshot({ navLabels: ['Casino'] })).verdict).toBe('blocked')
    expect(evaluateSnapshotPolicy(snapshot({ finalHost: 'canlibahis.example' })).verdict).toBe('blocked')
  })

  it('allows a clean site', () => {
    const result = evaluateSnapshotPolicy(snapshot({ title: 'Ege Nakliyat', text: 'Evden eve nakliyat hizmeti.' }))
    expect(result).toMatchObject({ verdict: 'allowed', blocked: [], restricted: [], findings: [] })
  })

  it('checks every generated ad string as prominent', () => {
    expect(evaluateCopyPolicy(['Güvenli Nakliyat', 'Hızlı Teklif']).verdict).toBe('allowed')
    expect(evaluateCopyPolicy(['Güvenli Nakliyat', 'Takipçi satın al']).verdict).toBe('blocked')
  })
})
