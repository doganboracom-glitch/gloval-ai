'use client'

import {
  icons as lucideIcons,
  Sparkles,
  type LucideProps,
} from 'lucide-react'

/**
 * Resolves a schema-provided icon name (e.g. "zap", "shield-check") to a
 * lucide-react icon. Falls back to a neutral default so an unknown or missing
 * name can never crash the renderer.
 */

function toPascalCase(name: string): string {
  return name
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function DynamicIcon({
  name,
  ...props
}: { name?: string } & LucideProps) {
  if (!name) return <Sparkles {...props} />
  const key = toPascalCase(name) as keyof typeof lucideIcons
  const Icon = lucideIcons[key]
  return Icon ? <Icon {...props} /> : <Sparkles {...props} />
}
