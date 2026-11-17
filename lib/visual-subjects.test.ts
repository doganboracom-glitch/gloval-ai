import { describe, expect, it, vi } from 'vitest'
import {
  describeVisualRequest,
  findGeneratedTopic,
  resolveVisualTopic,
  resolveVisualTopicSignals,
  stripImagePromptBoilerplate,
  variationCue,
} from './visual-subjects'
import {
  analyzeBrief,
  buildHeroImagePrompt,
  parseVisualSubjectPrediction,
  resolveVisualBrief,
} from './hero-image'
import type { WebsiteSchema } from './website-schema'
import { FIXED_IMAGE_NEGATIVE_TERMS } from './image-prompt-rules'
import { deriveSeoTitle, detectSector, sectorPromptHint } from './sector-profiles'
import { RADIO_STATION_BRIEF } from './__fixtures__/radio-station'

describe('resolveVisualTopic: yoga / pilates / fitness', () => {
  it('maps yoga to a calm yoga studio, not a gym', () => {
    const topic = resolveVisualTopic('Yoga stüdyosu için sakin bir açılış sayfası oluştur')
    expect(topic?.business).toBe('yoga studio')
    expect(topic?.subject).toMatch(/yoga mats/)
    expect(topic?.subject).toMatch(/natural light/)
    expect(topic?.subject).not.toMatch(/matte black equipment|athlete/)
  })

  it('maps pilates to a reformer studio, not a gym', () => {
    const topic = resolveVisualTopic('İstanbul pilates stüdyosu web sitesi')
    expect(topic?.business).toBe('pilates studio')
    expect(topic?.subject).toMatch(/reformer/)
    expect(topic?.subject).not.toMatch(/matte black equipment|athlete/)
  })

  it('keeps generic fitness and gym on the gym topic', () => {
    for (const prompt of ['fitness salonu sitesi', 'fitness club website', 'a gym landing page', 'crossfit box']) {
      const topic = resolveVisualTopic(prompt)
      expect(topic?.business, prompt).toBe('fitness studio / gym')
      expect(topic?.subject, prompt).toMatch(/gym interior/)
    }
  })
})

describe('resolveVisualTopic: Turkish "spor salonu" phrasing', () => {
  it('maps natural spor salonu phrases to the gym topic', () => {
    for (const prompt of [
      'Spor salonu için web sitesi',
      'spor salonu web sitesi',
      'İstanbul spor salonları için bir site oluştur',
      'Crossfit salonu',
      'fitness studio',
    ]) {
      const topic = resolveVisualTopic(prompt)
      expect(topic?.business, prompt).toBe('fitness studio / gym')
      expect(topic?.subject, prompt).toMatch(/gym interior/)
    }
  })

  it('keeps yoga and pilates studios off the gym topic', () => {
    expect(resolveVisualTopic('Yoga stüdyosu için web sitesi')?.business).toBe('yoga studio')
    expect(resolveVisualTopic('Pilates stüdyosu için web sitesi')?.business).toBe('pilates studio')
  })
})

describe('hero image chain keeps yoga / pilates topics', () => {
  it('does not turn yoga back into a gym in analyzeBrief or the prompt', () => {
    const brief = analyzeBrief('Yoga stüdyosu için sakin bir açılış sayfası oluştur')
    expect(brief.businessType).toBe('yoga studio')
    const prompt = buildHeroImagePrompt(brief)
    expect(prompt).toMatch(/yoga mats/)
    expect(prompt).toMatch(/for a yoga studio/)
    expect(prompt).not.toMatch(/gym/i)
  })

  it('does not turn pilates back into a gym in analyzeBrief or the prompt', () => {
    const brief = analyzeBrief('A boutique pilates studio website')
    expect(brief.businessType).toBe('pilates studio')
    const prompt = buildHeroImagePrompt(brief)
    expect(prompt).toMatch(/reformer/)
    expect(prompt).toMatch(/for a pilates studio/)
    expect(prompt).not.toMatch(/gym/i)
  })

  it('still builds a gym prompt for generic fitness', () => {
    const brief = analyzeBrief('modern fitness gym website')
    expect(brief.businessType).toBe('fitness studio / gym')
    expect(buildHeroImagePrompt(brief)).toMatch(/gym interior/)
  })

  it('does not change how the sector is detected', () => {
    expect(typeof detectSector('Yoga stüdyosu')).toBe('string')
  })
})

describe('deriveSeoTitle: yoga / pilates / fitness', () => {
  it('labels yoga and pilates as studios and keeps the gym label for fitness', () => {
    expect(deriveSeoTitle('Yoga stüdyosu sitesi', 'default', 'tr')).toBe('Yoga Stüdyosu')
    expect(deriveSeoTitle('Pilates stüdyosu sitesi', 'default', 'tr')).toBe('Pilates Stüdyosu')
    expect(deriveSeoTitle('Yoga studio site', 'default', 'en')).toBe('Yoga Studio')
    expect(deriveSeoTitle('spor salonu sitesi', 'default', 'tr')).toBe('Spor Salonu')
    expect(deriveSeoTitle('fitness club site', 'default', 'en')).toBe('Fitness Studio')
  })
})

describe('butcher vs grocery', () => {
  it('maps a butcher to a meat counter, not produce', () => {
    const topic = resolveVisualTopic('Mahalle Kasabı için web sitesi')
    expect(topic?.business).toBe('butcher shop')
    expect(topic?.subject).toMatch(/meat/)
    expect(topic?.avoid).toMatch(/vegetables/)
    expect(resolveVisualTopic('manav sitesi')?.business).toBe('grocery store / greengrocer')
  })
})

describe('radio / broadcasting visual topic', () => {
  it('resolves Turkish and English radio briefs to studio equipment and music', () => {
    for (const brief of [RADIO_STATION_BRIEF, 'Radio station website with live broadcasting and music']) {
      const topic = resolveVisualTopic(brief)
      expect(topic?.business, brief).toBe('radio station / broadcaster')
      expect(topic?.subject, brief).toMatch(/radio studio/i)
      expect(topic?.subject, brief).toMatch(/microphone/i)
      expect(topic?.subject, brief).toMatch(/mixing console/i)
      expect(topic?.subject, brief).toMatch(/headphones/i)
      expect(topic?.subject, brief).toMatch(/music/i)
      expect(topic?.avoid, brief).toMatch(/bakery/i)
    }
  })

  it('keeps the radio scene in hero, sector guidance, SEO and translated visual terms', () => {
    const brief = analyzeBrief(RADIO_STATION_BRIEF)
    expect(brief.sector).toBe('default')
    expect(brief.confidence).toBe('high')
    expect(brief.businessType).toBe('radio station / broadcaster')

    const heroPrompt = buildHeroImagePrompt(brief)
    expect(heroPrompt).toContain('audio mixing console')
    expect(heroPrompt).toContain('over-ear headphones')
    expect(sectorPromptHint(RADIO_STATION_BRIEF)).toContain(brief.visualNeed)
    expect(deriveSeoTitle(RADIO_STATION_BRIEF, 'default', 'tr')).toBe('İstanbul Radyo ve Yayıncılık')
    expect(deriveSeoTitle('Radio station website', 'default', 'en')).toBe('Radio Broadcasting')

    const translated = describeVisualRequest('Radyo stüdyosu: mikrofon, mikser, kulaklık ve müzik')
    expect(translated).toContain('radio broadcasting studio')
    expect(translated).toContain('audio mixing console')
    expect(translated).toContain('over-ear studio headphones')
  })

  it('does not confuse radiotherapy or music education with a radio station', () => {
    expect(resolveVisualTopic('Radyoterapi kliniği')).toBeNull()
    expect(resolveVisualTopic('Music school website')?.business).toBe('music school')
  })
})

describe('event and entertainment visual topics', () => {
  it.each([
    ['DJ Performans sitesi', 'live music & nightlife venue', /DJ performing/i],
    ['Gece kulübü web sitesi', 'live music & nightlife venue', /DJ performing/i],
    ['Müzik grubu ve konser sitesi', 'live music & nightlife venue', /concert lighting/i],
    ['Music school website', 'music school', /music school lesson/i],
    ['Wedding organizer website', 'wedding planning & celebration', /wedding reception/i],
    ['Parti ve etkinlik organizasyon firması', 'event planning & production', /celebration venue/i],
  ])('maps %s without confusing education or adjacent topics', (briefText, business, scene) => {
    const topic = resolveVisualTopic(briefText)
    expect(topic?.business ?? null).toBe(business)
    if (scene) expect(topic?.subject).toMatch(scene)
  })

  it('keeps the exact text ban at the end of the generated music prompt', () => {
    const prompt = buildHeroImagePrompt(analyzeBrief('DJ Performans sitesi'))
    expect(prompt).toContain(FIXED_IMAGE_NEGATIVE_TERMS)
    expect(prompt.trim().endsWith(`${FIXED_IMAGE_NEGATIVE_TERMS}.`)).toBe(true)
  })
})

describe('low-confidence visual fallback', () => {
  it('uses a neutral abstract scene without the business name or generic office stock', () => {
    const brief = analyzeBrief('Kivu brand website with a thoughtful editorial identity')
    expect(brief.sector).toBe('default')
    expect(brief.confidence).toBe('low')
    expect(brief.visualNeed).toMatch(/abstract editorial composition/i)
    expect(brief.visualNeed).not.toContain('Kivu')

    const prompt = buildHeroImagePrompt(brief, 'Kivu thoughtful editorial identity', 'Kivu')
    expect(prompt).not.toContain('Kivu')
    expect(prompt).toMatch(/Do NOT depict:.*unrelated people/i)
    expect(prompt).not.toMatch(/professional workspace|people at work/i)
    expect(prompt.trim().endsWith(`${FIXED_IMAGE_NEGATIVE_TERMS}.`)).toBe(true)
  })
})

describe('image request cleanup', () => {
  it('strips builder boilerplate from a stored prompt', () => {
    const topic = resolveVisualTopic('kasap')!
    const stored = `${topic.subject}. Photorealistic hero banner photograph for a butcher shop. Do NOT depict: fruits. Style: modern. Wide cinematic composition with clear negative space, Not an empty landscape. STRICT RULE: no text.`
    expect(stripImagePromptBoilerplate(stored)).toBe(`${topic.subject}.`)
    expect(findGeneratedTopic(stored)?.business).toBe('butcher shop')
  })

  it('does not match short keys inside English words', () => {
    expect(describeVisualRequest('every street scene')).toBe('every street scene')
  })

  it('varies the composition cue', () => {
    expect(variationCue(() => 0)).not.toBe(variationCue(() => 0.99))
  })
})

type VisualTopicFixture = {
  label: string
  signals: Parameters<typeof resolveVisualTopicSignals>[0]
  expected: string
}

const turkishBusinessFixtures: VisualTopicFixture[] = [
  {
    label: 'GebzeYapı mixed building trades',
    signals: {
      businessName: 'GebzeYapı',
      tagline: 'Konut, İşyeri ve Sanayi Yapısı Sahipleri, Müteahhitler, Site Yönetimleri',
      audience: 'Konut, işyeri ve sanayi yapısı sahipleri',
      serviceTitles: [
        'Alüminyum ve PVC Doğrama',
        'Cam Balkon',
        'Mekanik Tesisat',
        'Yangın Tesisatı',
        'Sıhhi Tesisat',
        'Çelik Konstrüksiyon ve Çatı',
      ],
      rest: 'GebzeYapı inşaat ve yapı işleri için web sitesi',
    },
    expected: 'construction company',
  },
  { label: 'Ankara çilingir', signals: { businessName: 'Ankara Çilingir' }, expected: 'locksmith & key service' },
  { label: 'şehirlerarası nakliyat', signals: { rest: 'İzmir şehirlerarası nakliyat ve evden eve taşıma firması' }, expected: 'moving & relocation company' },
  { label: 'oto lastik servisi', signals: { rest: 'Ankara oto lastikçi, lastik değişimi ve lastik tamiri' }, expected: 'tire shop & service' },
  { label: 'kombi servisi', signals: { rest: 'Kombi servisi ve yıllık kombi bakımı' }, expected: 'boiler & heating service' },
  { label: 'veteriner kliniği', signals: { rest: 'Veteriner kliniği ve evcil hayvan sağlığı' }, expected: 'veterinary clinic' },
  { label: 'mahalle berberi', signals: { rest: 'Mahalle berberi ve erkek saç kesimi salonu' }, expected: 'barbershop' },
  { label: 'Emlak ofisi', signals: { businessName: 'Ankara Emlak Ofisi' }, expected: 'real estate agency' },
  { label: 'profesyonel temizlik şirketi', signals: { rest: 'Profesyonel temizlik şirketi ve ev temizliği hizmeti' }, expected: 'professional cleaning company' },
  { label: 'mimarlık ofisi', signals: { businessName: 'Mimarlık Ofisi' }, expected: 'architecture studio' },
  { label: 'sıhhi tesisatçı', signals: { rest: 'Sıhhi tesisatçı, su kaçağı tamiri ve boru montajı' }, expected: 'plumbing service' },
  { label: 'boya badana ustası', signals: { rest: 'Boya badana ustası ve iç cephe boya işleri' }, expected: 'painting & decorating contractor' },
  { label: 'halı yıkama fabrikası', signals: { rest: 'Halı yıkama fabrikası ve profesyonel halı temizleme' }, expected: 'carpet & rug cleaning service' },
  { label: 'hırdavatçı', signals: { businessName: 'Merkez Hırdavatçı' }, expected: 'hardware & building supplies store' },
  { label: 'cam ve ayna atölyesi', signals: { rest: 'Cam ve ayna atölyesi, özel ölçü cam kesimi' }, expected: 'glass & mirror workshop' },
  { label: 'çatı ve izolasyon firması', signals: { rest: 'Çatı ve izolasyon firması, su yalıtımı ve çatı kaplama' }, expected: 'roofing & waterproofing contractor' },
  { label: 'asma tavan uygulaması', signals: { rest: 'Asma tavan ve akustik tavan sistemleri uygulaması' }, expected: 'suspended ceiling & interior systems contractor' },
  { label: 'çelik güvenlik kapı', signals: { rest: 'Çelik güvenlik kapı ve bina giriş sistemleri' }, expected: 'security door & gate company' },
  { label: 'klima servisi', signals: { rest: 'Klima servisi, klima bakımı ve montajı' }, expected: 'air conditioning & HVAC service' },
  { label: 'beyaz eşya servisi', signals: { rest: 'Beyaz eşya servisi, çamaşır makinesi ve buzdolabı tamiri' }, expected: 'home appliance repair service' },
  { label: 'fotoğraf ve video prodüksiyon', signals: { rest: 'Fotoğraf ve video prodüksiyon stüdyosu' }, expected: 'photography & video production studio' },
  { label: 'oto kuaför', signals: { rest: 'Oto kuaför ve araç detaylı temizlik stüdyosu' }, expected: 'automotive detailing studio' },
  { label: 'çelik konstrüksiyon', signals: { rest: 'Çelik konstrüksiyon ve çelik imalat firması' }, expected: 'construction company' },
  { label: 'özel okul', signals: { rest: 'Özel okul ve lise eğitim kurumu' }, expected: 'private school' },
  { label: 'müzik okulu', signals: { rest: 'Müzik okulu ve piyano dersleri' }, expected: 'music school' },
  { label: 'ebelik ve doğum kliniği', signals: { rest: 'Ebelik ve doğum kliniği, anne adaylarına danışmanlık' }, expected: 'midwifery & maternity care clinic' },
  { label: 'dövme stüdyosu', signals: { rest: 'Dövme stüdyosu ve piercing hizmeti' }, expected: 'tattoo studio' },
  { label: 'bağımsız kitabevi', signals: { rest: 'Bağımsız kitabevi ve mahalle kitapçısı' }, expected: 'independent bookstore' },
  { label: 'kreş ve gündüz bakımevi', signals: { rest: 'Kreş ve gündüz bakımevi, çocuk kulübü' }, expected: 'preschool / daycare' },
  { label: 'psikoterapi merkezi', signals: { rest: 'Psikolojik danışmanlık ve psikoterapi merkezi' }, expected: 'mental health counseling practice' },
  { label: 'elektrik taahhüt firması', signals: { rest: 'Elektrik taahhüt firması ve elektrik tesisatı' }, expected: 'electrical contractor' },
  { label: 'lojistik broker', signals: { rest: 'Uluslararası lojistik broker ve freight brokerage hizmeti' }, expected: 'freight brokerage & dispatch service' },
  { label: 'seyahat acentesi', signals: { rest: 'Seyahat acentesi, turizm acentesi ve tatil paketleri' }, expected: 'travel agency / tour operator' },
  { label: 'düğün fotoğrafçısı', signals: { rest: 'Düğün fotoğrafçısı ve düğün çekimi hizmeti' }, expected: 'photography & video production studio' },
]

describe('weighted visual topic matching', () => {
  it.each(turkishBusinessFixtures)('resolves $label to its dominant business scene', ({ label, signals, expected }) => {
    const resolution = resolveVisualTopicSignals(signals)
    expect(resolution.topic?.business, label).toBe(expected)
    expect(resolution.ambiguous, label).toBe(false)
  })

  it('does not let the removed generic keys select unrelated business topics', () => {
    const removedKeys = [
      'mekanik', 'kurs', 'tur', 'filo', 'sofor', 'event', 'party', 'bal',
      'market', 'apart', 'lastik', 'klima', 'kombi', 'tesisat', 'elektrik',
      'window', 'music', 'flower',
    ]

    for (const key of removedKeys) {
      expect(resolveVisualTopic(key), `generic key: ${key}`).toBeNull()
    }
    expect(resolveVisualTopic('mekanik')).not.toBeTruthy()
  })

  it('prioritizes business identity, prefers specific service phrases, and exposes close ties', () => {
    const identityWins = resolveVisualTopicSignals({
      businessName: 'Ankara Çilingir',
      serviceTitles: ['Oto Lastik Servisi'],
    })
    expect(identityWins.topic?.business).toBe('locksmith & key service')

    const specificService = resolveVisualTopicSignals({ rest: 'Oto lastik servisi ve lastik değişimi' })
    expect(specificService.candidates[0]?.matchedKeys).toContain('lastik servisi')

    const tie = resolveVisualTopicSignals({ serviceTitles: ['Oto lastik servisi', 'Cam balkon hizmeti'] })
    expect(tie.ambiguous).toBe(true)
    expect(tie.topic).toBeNull()
    expect(tie.candidates.map((candidate) => candidate.topic.business)).toEqual(
      expect.arrayContaining(['tire shop & service', 'doors & windows manufacturer']),
    )
  })
})

function createUnknownBusinessSite(): WebsiteSchema {
  return {
    meta: {
      name: 'Northline Systems',
      tagline: 'Reliable support for homes and offices',
      description: 'Local residential and business support',
      language: 'en',
      tone: 'modern and calm',
      audience: 'home and business owners',
    },
    navigation: { logoText: 'Northline Systems', links: [{ label: 'Home', href: '/' }] },
    theme: { mode: 'light' },
    sections: [
      {
        type: 'services',
        title: 'Services',
        items: [{ title: 'On-site support', description: 'Local service for customers' }],
      },
    ],
  } as unknown as WebsiteSchema
}

describe('LLM visual brief fallback', () => {
  it('uses a validated prediction and caches it by non-secret signal signature', async () => {
    const site = createUnknownBusinessSite()
    const infer = vi.fn(async () => ({
      business: 'locksmith service',
      subject: 'a locksmith cutting a replacement key at a clean workshop bench with lock cylinders and precision tools',
      avoid: 'car repair bays, tire shops, unrelated construction equipment',
    }))

    const first = await resolveVisualBrief('A local service company website', site, infer)
    const second = await resolveVisualBrief('A local service company website', site, infer)

    expect(first.businessType).toBe('locksmith service')
    expect(first.visualNeed).toMatch(/locksmith cutting a replacement key/)
    expect(first.confidence).toBe('high')
    expect(site.meta.visualSubjectCache?.signature).toMatch(/^[a-f0-9]{64}$/)
    expect(second.businessType).toBe(first.businessType)
    expect(infer).toHaveBeenCalledTimes(1)
  })

  it('falls back to the best keyword candidate when inference fails on a close tie', async () => {
    const site = createUnknownBusinessSite()
    site.meta.tagline = 'Local services for homeowners'
    site.sections = [
      {
        type: 'services',
        title: 'Services',
        items: [
          { title: 'Oto lastik servisi', description: 'Tire service' },
          { title: 'Cam balkon hizmeti', description: 'Balcony glazing' },
        ],
      },
    ] as unknown as WebsiteSchema['sections']

    const brief = await resolveVisualBrief('', site, async () => null)
    expect(brief.confidence).toBe('high')
    expect(['tire shop & service', 'doors & windows manufacturer']).toContain(brief.businessType)
  })

  it('rejects invalid or non-JSON model output without throwing', () => {
    expect(parseVisualSubjectPrediction('not json')).toBeNull()
    expect(parseVisualSubjectPrediction('{"business":"x","subject":"too short"}')).toBeNull()
    expect(
      parseVisualSubjectPrediction(JSON.stringify({
        business: 'locksmith service',
        subject: 'a locksmith replacing a lock cylinder with tools in a workshop',
        extra: 'unexpected',
      })),
    ).toBeNull()
  })
})
