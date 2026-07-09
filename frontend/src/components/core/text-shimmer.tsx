/* eslint-disable react-hooks/static-components --
   motion.create() is the library's intended API for a dynamic element tag; it's
   memoized by `as` below so the component identity is stable across renders. */
import {
  memo,
  useMemo,
  type CSSProperties,
  type ElementType,
  type JSX,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

export type TextShimmerProps = {
  children: string
  as?: ElementType
  className?: string
  duration?: number
  spread?: number
}

/**
 * Animated shimmer text — the canonical "AI is generating" indicator (reused by
 * the AI companion chat in Prompt 7). Themed to Hovio tokens: ink-soft base,
 * forest gradient sweep. Wrap usages in an `aria-live="polite"` region. Under
 * `prefers-reduced-motion` it renders static (no infinite animation).
 */
function TextShimmerComponent({
  children,
  as: Component = 'p',
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const reduced = useReducedMotion()
  const dynamicSpread = useMemo(
    () => children.length * spread,
    [children, spread],
  )
  const MotionComponent = useMemo(
    () => motion.create(Component as keyof JSX.IntrinsicElements),
    [Component],
  )

  if (reduced) {
    const Tag = Component
    return <Tag className={cn('text-ink-soft', className)}>{children}</Tag>
  }

  return (
    <MotionComponent
      className={cn(
        'relative inline-block bg-[length:250%_100%,auto] bg-clip-text',
        'text-transparent [--base-color:#5B615C] [--base-gradient-color:#1C5C32]',
        '[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
        className,
      )}
      initial={{ backgroundPosition: '100% center' }}
      animate={{ backgroundPosition: '0% center' }}
      transition={{ repeat: Infinity, duration, ease: 'linear' }}
      style={
        {
          '--spread': `${dynamicSpread}px`,
          backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
        } as CSSProperties
      }
    >
      {children}
    </MotionComponent>
  )
}

export const TextShimmer = memo(TextShimmerComponent)
