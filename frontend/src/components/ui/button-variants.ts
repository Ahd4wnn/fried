import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'focus-ring inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  // Primary is forest on cream — never danger red for primary actions.
  primary: 'bg-forest text-cream hover:bg-forest-deep',
  secondary:
    'border border-forest/20 bg-paper text-forest hover:bg-forest-tint',
  ghost: 'bg-transparent text-forest hover:bg-forest-tint',
  quiet: 'bg-transparent text-ink-soft hover:bg-line/50 hover:text-ink',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm', // 44px — meets the tap-target floor
  lg: 'h-12 px-6 text-base',
}

/** Shared class composition so links can be styled identically to buttons. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}): string {
  return cn(base, variants[variant], sizes[size], className)
}
