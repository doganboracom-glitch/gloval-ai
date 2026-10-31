import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
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
    expect(markup).toContain('maxlength="160"')
    expect(markup).toContain('0/160')
  })
})
