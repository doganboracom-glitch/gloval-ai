import type { LegalBlock, LegalInline } from '@/lib/legal-markup'

function Inline({ runs }: { runs: LegalInline[] }) {
  return (
    <>
      {runs.map((run, i) => {
        const content = run.bold ? (
          <strong className="font-semibold">{run.text}</strong>
        ) : (
          <span>{run.text}</span>
        )
        return run.href ? (
          <a
            key={i}
            href={run.href}
            target={run.href.startsWith('/') ? undefined : '_blank'}
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2"
          >
            {content}
          </a>
        ) : (
          <span key={i}>{content}</span>
        )
      })}
    </>
  )
}

/**
 * Renders parsed legal markup as plain React nodes (never innerHTML).
 * `site` uses the published site's CSS variables; `editor` uses app tokens.
 */
export function LegalBlocks({
  blocks,
  variant = 'site',
}: {
  blocks: LegalBlock[]
  variant?: 'site' | 'editor'
}) {
  const mutedStyle = variant === 'site' ? { color: 'var(--site-muted-fg)' } : undefined
  const mutedClass = variant === 'editor' ? 'text-muted-foreground' : ''
  return (
    <div className="grid gap-3">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h2 key={i} className="mt-4 text-lg font-semibold first:mt-0">
              <Inline runs={block.inline} />
            </h2>
          )
        }
        if (block.type === 'list') {
          return (
            <ul
              key={i}
              className={`ml-5 grid list-disc gap-1.5 text-sm leading-relaxed ${mutedClass}`}
              style={mutedStyle}
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline runs={item} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p
            key={i}
            className={`text-pretty text-sm leading-relaxed ${mutedClass}`}
            style={mutedStyle}
          >
            <Inline runs={block.inline} />
          </p>
        )
      })}
    </div>
  )
}
