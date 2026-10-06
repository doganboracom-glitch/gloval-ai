'use client'

import {
  MessageSquare,
  Palette,
  PenLine,
  Smartphone,
  Search,
  Rocket,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'

const icons = [MessageSquare, Palette, PenLine, Smartphone, Search, Rocket]

export function Features() {
  const { t } = useLanguage()

  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:py-28">
      <SectionHeading title={t.features.title} subtitle={t.features.subtitle} />

      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {t.features.items.map((item, i) => {
          const Icon = icons[i] ?? MessageSquare
          return (
            <div
              key={item.title}
              className="group bg-card p-6 transition-colors hover:bg-secondary/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function SectionHeading({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-pretty text-muted-foreground">{subtitle}</p>
    </div>
  )
}
