import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/**
 * Loading placeholder. Uses a gentle pulse that flattens to a static block
 * under reduced motion (the global rule in index.css neutralizes the animation).
 */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-line/70', className)}
      {...props}
    />
  )
}
