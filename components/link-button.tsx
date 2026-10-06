import { cn } from '@/lib/utils'

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  // Marka moru: --primary koyu kapsamlarda nötr griye döndüğü için mor kalması
  // gereken CTA'lar (fiyatlandırma) bu varyantı kullanır.
  brand: 'bg-brand text-brand-foreground hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function LinkButton({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
  onClick,
}: {
  href: string
  children: React.ReactNode
  variant?: Variant
  size?: Size
  className?: string
  onClick?: () => void
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </a>
  )
}
