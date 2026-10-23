// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { GalleryFields, GalleryItemExtras } from '@/components/editor/gallery-fields'
import { applyOperation, type EditOperation } from '@/lib/website-edit-operations'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { GallerySection } from '@/lib/gallery-albums'

const GALLERY = 2
const YT = 'dQw4w9WgXcQ'

function makeSite(items?: Record<string, unknown>[]): WebsiteSchema {
  return {
    meta: { name: 'Studio', tagline: 'T', description: 'D', tone: 'Sakin', audience: 'A', language: 'tr' },
    theme: {
      mode: 'light',
      radius: 'medium',
      palette: [
        { name: 'Ana', hex: '#2563eb' },
        { name: 'Zemin', hex: '#ffffff' },
        { name: 'Metin', hex: '#111827' },
      ],
    },
    typography: { headingFont: 'Inter', bodyFont: 'Inter' },
    navigation: { logoText: 'S', links: [{ label: 'Ana', href: '/' }] },
    pages: [{ slug: 'home', title: 'Ana', isHome: true }],
    sections: [
      { type: 'hero', title: 'Studio', description: 'x' },
      { type: 'about', title: 'Hakkımızda', body: 'Metin' },
      {
        type: 'gallery',
        title: 'Galeri',
        items: items ?? [
          { src: 'https://example.com/a.jpg', alt: 'A' },
          { src: 'https://example.com/b.jpg', alt: 'B' },
        ],
      },
      { type: 'footer' },
    ],
  } as unknown as WebsiteSchema
}

type History = { past: WebsiteSchema[]; present: WebsiteSchema; future: WebsiteSchema[] }

/** Mirrors the editor's history stack: every dispatched operation is one undoable step. */
function Harness({ initial, itemIndex }: { initial: WebsiteSchema; itemIndex?: number }) {
  const [h, setH] = useState<History>({ past: [], present: initial, future: [] })
  const dispatch = (op: EditOperation) =>
    setH((cur) => {
      const next = applyOperation(cur.present, op)
      return next === cur.present ? cur : { past: [...cur.past, cur.present], present: next, future: [] }
    })
  const section = h.present.sections[GALLERY] as GallerySection
  return (
    <div>
      <button onClick={() => setH((c) => (c.past.length ? { past: c.past.slice(0, -1), present: c.past[c.past.length - 1], future: [c.present, ...c.future] } : c))}>undo</button>
      <button onClick={() => setH((c) => (c.future.length ? { past: [...c.past, c.present], present: c.future[0], future: c.future.slice(1) } : c))}>redo</button>
      <output data-testid="state">{JSON.stringify(section)}</output>
      <GalleryFields site={h.present} index={GALLERY} section={section} onDispatch={dispatch} />
      {itemIndex !== undefined && (
        <GalleryItemExtras site={h.present} index={GALLERY} itemIndex={itemIndex} section={section} onDispatch={dispatch} />
      )}
    </div>
  )
}

const state = (): GallerySection => JSON.parse(screen.getByTestId('state').textContent ?? '{}')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function addAlbumByName(name: string) {
  fireEvent.change(screen.getByTestId('gallery-album-input'), { target: { value: name } })
  fireEvent.click(screen.getByTestId('gallery-album-add'))
}

describe('editor hints', () => {
  it('shows the pages hint and the recommended image size', () => {
    render(<Harness initial={makeSite()} />)
    expect(screen.getByTestId('gallery-pages-hint').textContent).toBe(
      'Bu bölüm /galeri ve /videolar sayfalarını oluşturur; menüye Sayfalar panelinden ekleyin.',
    )
    expect(screen.getByTestId('gallery-size-hint').textContent).toContain('1600×1200 px')
    expect(screen.getByTestId('gallery-size-hint').textContent).toContain('5 MB')
  })
})

describe('albums', () => {
  it('adds, renames and deletes an album; deleting moves photos to Genel after a confirmation with the count', () => {
    render(<Harness initial={makeSite()} />)
    addAlbumByName('Firmamızdan Kareler')
    expect(state().albums?.map((a) => a.name)).toEqual(['Firmamızdan Kareler'])
    expect((screen.getByTestId('gallery-album-input') as HTMLInputElement).value).toBe('')

    const albumId = state().albums![0].id
    fireEvent.change(screen.getByTestId('gallery-album-input'), { target: { value: '' } })

    // rename
    const row = screen.getByTestId('gallery-album-row')
    const nameInput = within(row).getByDisplayValue('Firmamızdan Kareler')
    fireEvent.change(nameInput, { target: { value: 'Ofisimiz' } })
    fireEvent.blur(nameInput)
    expect(state().albums![0].name).toBe('Ofisimiz')
    expect(state().albums![0].previousSlugs).toContain('firmamizdan-kareler')

    // assign a photo, then delete the album
    const op = applyOperation(
      { ...makeSite(), sections: makeSite().sections } as WebsiteSchema,
      { op: 'addAlbum', index: GALLERY, name: 'x' },
    )
    expect(op).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Sil: Ofisimiz'))
    const dialog = screen.getByTestId('gallery-album-confirm')
    expect(dialog.textContent).toContain('Bu albümde görsel yok.')
    fireEvent.click(within(dialog).getByTestId('gallery-album-confirm-yes'))
    expect(state().albums ?? []).toEqual([])
    expect(albumId).toBeTruthy()
  })

  it('the confirmation shows how many photos move to Genel', () => {
    render(<Harness initial={makeSite()} itemIndex={0} />)
    addAlbumByName('Etkinlik')
    fireEvent.change(screen.getByTestId('gallery-item-album'), { target: { value: state().albums![0].id } })
    expect(state().items[0].album).toBe('Etkinlik')

    fireEvent.click(screen.getByLabelText('Sil: Etkinlik'))
    expect(screen.getByTestId('gallery-album-confirm').textContent).toContain('1 görsel')
    fireEvent.click(screen.getByTestId('gallery-album-confirm-yes'))
    expect(state().items[0].album).toBeUndefined()
    expect(state().items).toHaveLength(2)
  })

  it('rejects an empty, duplicate (case-insensitive) or reserved name with a clear message', () => {
    render(<Harness initial={makeSite()} />)
    addAlbumByName('Ofis')
    addAlbumByName('ofis')
    expect(screen.getByTestId('gallery-album-error').textContent).toContain('Bu adla başka bir kayıt var')
    addAlbumByName('genel')
    expect(screen.getByTestId('gallery-album-error').textContent).toContain('ayrılmıştır')
    addAlbumByName('   ')
    expect(screen.getByTestId('gallery-album-error').textContent).toContain('boş olamaz')
    expect(state().albums).toHaveLength(1)
  })

  it('reorders albums', () => {
    render(<Harness initial={makeSite()} />)
    addAlbumByName('A')
    addAlbumByName('B')
    fireEvent.click(screen.getAllByLabelText('Yukarı taşı')[1])
    expect(state().albums!.map((a) => a.name)).toEqual(['B', 'A'])
  })
})

describe('album assignment and alt text', () => {
  it('lists Genel plus the albums, defaults to Genel, and assigns a photo', () => {
    render(<Harness initial={makeSite()} itemIndex={1} />)
    addAlbumByName('Ofis')
    const select = screen.getByTestId('gallery-item-album') as HTMLSelectElement
    expect(select.value).toBe('')
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Genel', 'Ofis'])
    fireEvent.change(select, { target: { value: state().albums![0].id } })
    expect(state().items[1].album).toBe('Ofis')
    fireEvent.change(select, { target: { value: '' } })
    expect(state().items[1].album).toBeUndefined()
  })

  it('flags a missing alt text and fills in the suggestion', () => {
    render(<Harness initial={makeSite([{ src: 'https://example.com/a.jpg' }])} itemIndex={0} />)
    const warning = screen.getByTestId('gallery-alt-missing')
    expect(warning.textContent).toContain('Alt metin boş')
    fireEvent.click(within(warning).getByRole('button'))
    expect(state().items[0].alt).toBe('Studio - fotoğraf 1')
    expect(screen.queryByTestId('gallery-alt-missing')).toBeNull()
  })
})

describe('multi image upload', () => {
  const file = (name: string, type: string, size = 8) => {
    const f = new File([new Uint8Array(size)], name, { type })
    return f
  }

  it('adds several photos at once and reports the ones refused', async () => {
    render(<Harness initial={makeSite()} />)
    const input = screen.getByTestId('gallery-multi-upload') as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [
          file('a.png', 'image/png'),
          file('b.jpg', 'image/jpeg'),
          file('c.gif', 'image/gif'),
          file('d.webp', 'image/webp', 5 * 1024 * 1024 + 1),
        ],
      },
    })
    await waitFor(() => expect(state().items).toHaveLength(4))
    const notes = screen.getByTestId('gallery-upload-messages').textContent ?? ''
    expect(notes).toContain('2 görsel eklendi.')
    expect(notes).toContain('c.gif: yalnızca PNG, JPG veya WebP yüklenebilir.')
    expect(notes).toContain('d.webp: görsel en fazla 5 MB olabilir.')
    expect(state().items.slice(2).every((i) => i.src?.startsWith('data:image/') && i.alt)).toBe(true)
  })

  it('is a single undo step', async () => {
    render(<Harness initial={makeSite()} />)
    fireEvent.change(screen.getByTestId('gallery-multi-upload'), {
      target: { files: [file('a.png', 'image/png'), file('b.png', 'image/png')] },
    })
    await waitFor(() => expect(state().items).toHaveLength(4))
    fireEvent.click(screen.getByText('undo'))
    expect(state().items).toHaveLength(2)
    fireEvent.click(screen.getByText('redo'))
    expect(state().items).toHaveLength(4)
  })
})

describe('videos', () => {
  function stubCover(result: 'ok' | 'none' | 'throw') {
    const fetchMock = vi.fn(async (..._args: unknown[]) => {
      if (result === 'throw') throw new Error('offline')
      return new Response(JSON.stringify({ cover: result === 'ok' ? { src: 'https://storage.example.com/c.jpg' } : null }), {
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  function addVideoByUrl(name: string, url: string) {
    fireEvent.change(screen.getByTestId('gallery-video-name'), { target: { value: name } })
    fireEvent.change(screen.getByTestId('gallery-video-url'), { target: { value: url } })
    fireEvent.click(screen.getByText('Video ekle'))
  }

  it('uses the required placeholder, which disappears on focus', () => {
    render(<Harness initial={makeSite()} />)
    const url = screen.getByTestId('gallery-video-url') as HTMLInputElement
    expect(url.placeholder).toBe('YouTube bağlantısını yapıştırın')
    fireEvent.focus(url)
    expect(url.placeholder).toBe('')
    fireEvent.blur(url)
    expect(url.placeholder).toBe('YouTube bağlantısını yapıştırın')
  })

  it('adds a video with the server-stored cover and never calls YouTube from the browser', async () => {
    const fetchMock = stubCover('ok')
    render(<Harness initial={makeSite()} />)
    addVideoByUrl('Demo 1', `https://www.youtube.com/watch?v=${YT}`)
    await waitFor(() => expect(state().videos).toHaveLength(1))
    const video = state().videos![0]
    expect(video.name).toBe('Demo 1')
    expect(video.provider).toBe('youtube')
    expect(video.videoId).toBe(YT)
    expect(video.cover?.src).toBe('https://storage.example.com/c.jpg')
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(['/api/gallery-video-cover'])
  })

  it('falls back to a themed card and offers a cover upload when the thumbnail cannot be downloaded', async () => {
    for (const result of ['none', 'throw'] as const) {
      cleanup()
      stubCover(result)
      render(<Harness initial={makeSite()} />)
      addVideoByUrl('Demo 1', `https://youtu.be/${YT}`)
      await waitFor(() => expect(state().videos).toHaveLength(1))
      expect(state().videos![0].cover).toBeUndefined()
      expect(screen.getByTestId('gallery-video-cover-note').textContent).toContain('tema renkli kart')
      expect(screen.getByText('Kapak yükle')).toBeTruthy()
    }
  })

  it('rejects an invalid or look-alike address with a clear warning and adds nothing', () => {
    const fetchMock = stubCover('ok')
    render(<Harness initial={makeSite()} />)
    for (const bad of [
      'https://youtube.com.evil.com/watch?v=' + YT,
      'https://youtube.com@evil.com/watch?v=' + YT,
      'https://evil.com/youtube.com/watch?v=' + YT,
      'merhaba',
    ]) {
      addVideoByUrl('Demo', bad)
      expect(screen.getByTestId('gallery-video-error').textContent).toContain('Geçerli bir YouTube bağlantısı girin')
    }
    expect(state().videos ?? []).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renames, reorders and deletes videos, and undo/redo walk through them', async () => {
    stubCover('none')
    render(<Harness initial={makeSite()} />)
    addVideoByUrl('Demo 1', `https://youtu.be/${YT}`)
    await waitFor(() => expect(state().videos).toHaveLength(1))
    addVideoByUrl('Demo 2', 'https://vimeo.com/424242')
    await waitFor(() => expect(state().videos).toHaveLength(2))

    const rows = () => screen.getAllByTestId('gallery-video-row')
    const nameInput = within(rows()[1]).getByDisplayValue('Demo 2')
    fireEvent.change(nameInput, { target: { value: 'Tanıtım' } })
    fireEvent.blur(nameInput)
    expect(state().videos!.map((v) => v.name)).toEqual(['Demo 1', 'Tanıtım'])

    fireEvent.click(within(rows()[1]).getByLabelText('Yukarı taşı'))
    expect(state().videos!.map((v) => v.name)).toEqual(['Tanıtım', 'Demo 1'])

    fireEvent.click(within(rows()[0]).getByLabelText('Sil: Tanıtım'))
    expect(state().videos!.map((v) => v.name)).toEqual(['Demo 1'])

    fireEvent.click(screen.getByText('undo'))
    expect(state().videos!.map((v) => v.name)).toEqual(['Tanıtım', 'Demo 1'])
    fireEvent.click(screen.getByText('undo'))
    fireEvent.click(screen.getByText('undo'))
    expect(state().videos!.map((v) => v.name)).toEqual(['Demo 1', 'Demo 2'])
    fireEvent.click(screen.getByText('redo'))
    expect(state().videos!.map((v) => v.name)).toEqual(['Demo 1', 'Tanıtım'])
  })
})
