import { describe, expect, it } from 'vitest'
import { classifyEditInstruction, foldInstruction, stripQuoted } from './edit-intent-gates'

describe('foldInstruction / stripQuoted', () => {
  it('folds Turkish letters and whitespace', () => {
    expect(foldInstruction('  MENÜDEN   Çıkar ')).toBe('menuden cikar')
  })

  it('drops quoted content so it is never read as an instruction', () => {
    expect(stripQuoted('Başlığı "Login sayfası" yap')).toBe('Başlığı yap')
  })
})

describe('blog menu gate', () => {
  it('points removal at the "Menüde göster" switch', () => {
    const gate = classifyEditInstruction('Blogu menüden kaldır', 'tr')
    expect(gate?.kind).toBe('blog-menu')
    expect(gate?.message).toContain('Menüde göster')
    expect(gate?.message).not.toContain('desteklenmiyor')
  })

  it('points adding at the same switch', () => {
    const gate = classifyEditInstruction('Menüye blog ekle', 'tr')
    expect(gate?.kind).toBe('blog-menu')
    expect(gate?.message).toContain('Menüde göster')
    expect(gate?.message).not.toContain('desteklenmiyor')
  })

  it('answers in English too', () => {
    expect(classifyEditInstruction('remove blog from the menu', 'en')?.message).toContain('Show in menu')
    expect(classifyEditInstruction('add blog to the menu', 'en')?.message).toContain('Show in menu')
  })

  it('ignores blog mentions that are not about the menu', () => {
    expect(classifyEditInstruction('Blog bölümünün başlığını Haberler yap', 'tr')).toBeNull()
  })
})

describe('unsupported capability gate', () => {
  it.each([
    ['Kullanıcı girişi ekle', 'tr'],
    ['Sunucuyu başka bir hosting firmasına taşı', 'tr'],
    ['Stripe entegrasyonu ekle', 'tr'],
    ['add user login to the site', 'en'],
  ] as const)('refuses %s without spending credit', (text, lang) => {
    const gate = classifyEditInstruction(text, lang)
    expect(gate?.kind).toBe('unsupported')
    expect(gate?.message).toContain(lang === 'tr' ? 'kredi harcanmadı' : 'no credit was spent')
  })

  it('lets supported integrations through', () => {
    expect(classifyEditInstruction('Instagram entegrasyonu ekle', 'tr')).toBeNull()
    expect(classifyEditInstruction('Google Analytics ekle', 'tr')).toBeNull()
  })

  it('never reacts to quoted copy', () => {
    expect(classifyEditInstruction('Hero başlığını "Üye girişi ekle" yap', 'tr')).toBeNull()
  })
})

describe('vague instruction gate', () => {
  it('asks for detail on short, targetless requests', () => {
    expect(classifyEditInstruction('daha güzel yap', 'tr')?.kind).toBe('vague')
    expect(classifyEditInstruction('make it nicer', 'en')?.kind).toBe('vague')
  })

  it('lets a selected section through', () => {
    expect(classifyEditInstruction('daha güzel yap', 'tr', { scoped: true })).toBeNull()
  })

  it('lets concrete instructions through', () => {
    expect(classifyEditInstruction('Ana rengi mavi yap', 'tr')).toBeNull()
    expect(classifyEditInstruction('Hizmetler bölümünü yukarı taşı', 'tr')).toBeNull()
  })

  it('ignores empty input', () => {
    expect(classifyEditInstruction(' ', 'tr')).toBeNull()
  })
})
