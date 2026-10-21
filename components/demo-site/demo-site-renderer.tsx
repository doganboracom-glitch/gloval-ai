'use client'

import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'

type Props = Omit<ComponentProps<typeof WebsiteRenderer>, 'onDemoRoute'>

export function DemoSiteRenderer(props: Props) {
  const router = useRouter()
  return <WebsiteRenderer {...props} onDemoRoute={(url) => router.push(url)} />
}
