import { describe, expect, it } from 'vitest'
import { GALLERY_VIDEO_URL_MAX, isGalleryVideoUrl, parseGalleryVideoUrl } from './gallery-video'

const YT = 'dQw4w9WgXcQ'

describe('parseGalleryVideoUrl accepts the supported shapes', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${YT}`, 'youtube', YT],
    [`https://youtube.com/watch?v=${YT}&t=10s`, 'youtube', YT],
    [`https://m.youtube.com/watch?v=${YT}`, 'youtube', YT],
    [`https://youtu.be/${YT}`, 'youtube', YT],
    [`https://youtu.be/${YT}?si=abc`, 'youtube', YT],
    [`https://www.youtube.com/shorts/${YT}`, 'youtube', YT],
    [`https://www.youtube.com/embed/${YT}`, 'youtube', YT],
    [`https://www.youtube-nocookie.com/embed/${YT}`, 'youtube', YT],
    ['https://vimeo.com/123456789', 'vimeo', '123456789'],
    ['https://www.vimeo.com/76979871', 'vimeo', '76979871'],
    [`  https://youtu.be/${YT}  `, 'youtube', YT],
    [`youtube.com/watch?v=${YT}`, 'youtube', YT],
  ])('%s', (url, provider, videoId) => {
    const ref = parseGalleryVideoUrl(url)
    expect(ref?.provider).toBe(provider)
    expect(ref?.videoId).toBe(videoId)
  })

  it('returns canonical watch and privacy-friendly embed addresses', () => {
    const yt = parseGalleryVideoUrl(`https://youtu.be/${YT}`)
    expect(yt?.watchUrl).toBe(`https://www.youtube.com/watch?v=${YT}`)
    expect(yt?.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${YT}`)
    const vi = parseGalleryVideoUrl('https://vimeo.com/123456')
    expect(vi?.watchUrl).toBe('https://vimeo.com/123456')
    expect(vi?.embedUrl).toBe('https://player.vimeo.com/video/123456?dnt=1')
  })
})

describe('parseGalleryVideoUrl rejects look-alikes and malformed input', () => {
  it.each([
    [`https://youtube.com.evil.com/watch?v=${YT}`],
    [`https://youtube.com@evil.com/watch?v=${YT}`],
    [`https://www.youtube.com@evil.com/${YT}`],
    [`https://evil.com/youtube.com/watch?v=${YT}`],
    [`https://evil.com/?u=https://youtu.be/${YT}`],
    [`https://evilyoutube.com/watch?v=${YT}`],
    [`https://notyoutu.be/${YT}`],
    [`https://youtu.be.evil.com/${YT}`],
    ['https://vimeo.com.evil.com/123456'],
    ['https://evil.com/vimeo.com/123456'],
    ['https://fakevimeo.com/123456'],
    [`https://user:pw@youtube.com/watch?v=${YT}`],
    [`https://youtube.com:8443/watch?v=${YT}`],
    [`http://youtu.be/${YT}`],
    [`javascript:alert(1)//youtube.com/watch?v=${YT}`],
    [`data:text/html,youtube.com/watch?v=${YT}`],
    [`https://youtube.com\\@evil.com/watch?v=${YT}`],
    [`https://www.youtube.com/watch?v=short`],
    [`https://www.youtube.com/watch`],
    [`https://www.youtube.com/@channel`],
    [`https://www.youtube.com/playlist?list=PL123`],
    [`https://www.youtube-nocookie.com/watch?v=${YT}`],
    [`https://www.youtube-nocookie.com/shorts/${YT}`],
    [`https://youtu.be/${YT}/extra`],
    ['https://vimeo.com/channels/staffpicks'],
    ['https://vimeo.com/abc'],
    ['https://vimeo.com/'],
    [`https://youtu.be/${YT} https://evil.com`],
    [''],
    ['   '],
    ['not a url'],
  ])('%s', (url) => {
    expect(parseGalleryVideoUrl(url)).toBeNull()
    expect(isGalleryVideoUrl(url)).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(parseGalleryVideoUrl(undefined)).toBeNull()
    expect(parseGalleryVideoUrl(null)).toBeNull()
    expect(parseGalleryVideoUrl(42 as unknown as string)).toBeNull()
  })

  it('enforces the 300 character limit', () => {
    const base = `https://www.youtube.com/watch?v=${YT}&x=`
    const ok = base + 'a'.repeat(GALLERY_VIDEO_URL_MAX - base.length)
    const tooLong = ok + 'a'
    expect(ok.length).toBe(GALLERY_VIDEO_URL_MAX)
    expect(parseGalleryVideoUrl(ok)?.videoId).toBe(YT)
    expect(tooLong.length).toBe(GALLERY_VIDEO_URL_MAX + 1)
    expect(parseGalleryVideoUrl(tooLong)).toBeNull()
  })
})
