import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type BadgeTone = 'neutral' | 'forest' | 'success' | 'warning' | 'danger'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-line/60 text-ink-soft',
  forest: 'bg-forest-tint text-forest-deep',
  success: 'bg-forest-tint text-forest-deep',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
}

/** Small pill for status and labels. */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
