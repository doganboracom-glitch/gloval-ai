'use client'

import { useLanguage } from '@/components/language-provider'
import type { MailAlias } from '@/lib/mail/types'

type Row = MailAlias & { domain: string }

export function MailAliases({ aliases }: { aliases: Row[] }) {
  const { t, lang } = useLanguage()
  const m = t.mail

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    dateStyle: 'medium',
  })

  if (aliases.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-14 text-center text-sm text-muted-foreground">
        {m.noAliases}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card/70">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-medium">
              {m.address}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {m.destinations}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {m.created}
            </th>
          </tr>
        </thead>
        <tbody>
          {aliases.map((alias) => (
            <tr key={alias.id} className="border-t border-border/60">
              <td className="px-4 py-3 font-medium">{alias.address}</td>
              <td className="px-4 py-3">
                <ul className="flex flex-wrap gap-1.5">
                  {alias.destinations.map((dest) => (
                    <li
                      key={dest}
                      className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs text-muted-foreground"
                    >
                      {dest}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {dateFmt.format(new Date(alias.createdAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
