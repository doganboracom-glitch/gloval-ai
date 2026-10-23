import { teamExampleTagLabel } from '@/lib/team'

/** Showcase demos only: states once per block that the people are fictional. */
export function TeamExampleTag({ lang }: { lang: 'tr' | 'en' }) {
  return (
    <p className="mt-4 flex justify-center">
      <span
        data-demo-example-content
        className="rounded-full px-3 py-1 text-xs font-medium"
        style={{
          border: '1px solid var(--site-border)',
          color: 'var(--site-muted, var(--site-fg))',
          backgroundColor: 'var(--site-card)',
        }}
      >
        {teamExampleTagLabel(lang)}
      </span>
    </p>
  )
}
