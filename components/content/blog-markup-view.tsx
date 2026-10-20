import { parseBlogMarkup, type BlogInline } from '@/lib/blog-markup'

function Inline({ runs }: { runs: BlogInline[] }) {
  return (
    <>
      {runs.map((run, i) => {
        let node: React.ReactNode = run.text
        if (run.bold) node = <strong className="font-semibold text-foreground">{node}</strong>
        if (run.italic) node = <em>{node}</em>
        if (run.href) {
          const external = /^https?:\/\//i.test(run.href)
          node = (
            <a
              href={run.href}
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {node}
            </a>
          )
        }
        return <span key={i}>{node}</span>
      })}
    </>
  )
}

/**
 * Renders blog markup as React nodes (no dangerouslySetInnerHTML). Shared by
 * the public article and the admin live preview so they can never drift.
 */
export function BlogMarkupView({ markup }: { markup: string }) {
  const blocks = parseBlogMarkup(markup)

  return (
    <div>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h2
                key={i}
                className="mt-10 text-balance font-display text-2xl font-semibold tracking-tight first:mt-0"
              >
                <Inline runs={block.inline} />
              </h2>
            ) : (
              <h3
                key={i}
                className="mt-8 text-balance font-display text-xl font-semibold tracking-tight first:mt-0"
              >
                <Inline runs={block.inline} />
              </h3>
            )
          case 'list':
            return (
              <ul key={i} className="mt-5 flex flex-col gap-2.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3 text-pretty leading-relaxed">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="text-muted-foreground">
                      <Inline runs={item} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          case 'quote':
            return (
              <blockquote
                key={i}
                className="mt-6 border-l-2 border-primary/50 pl-4 text-pretty italic leading-relaxed text-foreground/80"
              >
                <Inline runs={block.inline} />
              </blockquote>
            )
          case 'image':
            return (
              <figure key={i} className="mt-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.src}
                  alt={block.alt}
                  loading="lazy"
                  className="w-full rounded-xl border border-border"
                />
                {block.alt && (
                  <figcaption className="mt-2 text-center text-sm text-muted-foreground">{block.alt}</figcaption>
                )}
              </figure>
            )
          default:
            return (
              <p key={i} className="mt-5 text-pretty leading-relaxed text-muted-foreground">
                <Inline runs={block.inline} />
              </p>
            )
        }
      })}
    </div>
  )
}
