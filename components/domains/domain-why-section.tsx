import { FileText, LayoutDashboard, Link2, Mail, Wallet } from 'lucide-react'
import type { Dict } from '@/lib/i18n'

export function DomainWhySection({ copy }: { copy: Dict['domainSearch'] }) {
  const items = [
    { icon: LayoutDashboard, title: copy.why1Title, body: copy.why1Body },
    { icon: Link2, title: copy.why2Title, body: copy.why2Body },
    { icon: Wallet, title: copy.why3Title, body: copy.why3Body },
    { icon: FileText, title: copy.why4Title, body: copy.why4Body },
    { icon: Mail, title: copy.why5Title, body: copy.why5Body },
  ]

  return (
    <section aria-labelledby="domain-why-title">
      <h2 id="domain-why-title" className="font-display text-2xl font-semibold tracking-tight">
        {copy.whyTitle}
      </h2>
      <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{copy.whySubtitle}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-xl border border-border bg-card p-5">
            <Icon className="size-5 text-brand" aria-hidden="true" />
            <h3 className="mt-3 font-display text-base font-semibold">{title}</h3>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
