import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: () => {},
    forward: () => {},
    push: () => {},
    replace: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
import { LanguageProvider } from '@/components/language-provider'
import { WebsiteEditorPanel } from '@/components/website-editor-panel'
import { buildCleanSite } from '@/lib/__fixtures__/sample-site'

describe('WebsiteEditorPanel SEO description field', () => {
  it('renders a localized textarea with its helper, limit, and live counter', () => {
    const site = buildCleanSite()
    site.meta.description = ''

    const markup = renderToStaticMarkup(
      <LanguageProvider initialLang="tr">
        <WebsiteEditorPanel
          site={site}
          messages={[]}
          loading={false}
          canUndo={false}
          canRedo={false}
          onDispatch={() => {}}
          onSubmitAi={() => {}}
          onUndo={() => {}}
          onRedo={() => {}}
          onClose={() => {}}
        />
      </LanguageProvider>,
    )

    expect(markup).toContain('SEO Açıklaması')
    expect(markup).toContain('Google arama sonuçlarında')
    expect(markup).toMatch(/maxlength="160"/i)
    expect(markup).toContain('0/160')
  })
})
