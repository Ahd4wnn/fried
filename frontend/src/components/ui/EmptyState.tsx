import type { ComponentType, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface EmptyStateProps {
  /** A lucide icon (or any icon component accepting className). */
  icon?: ComponentType<{ className?: string }>
  title: string
  /** Supportive line that invites the next action (see voice rules). */
  description?: string
  action?: ReactNode
  className?: string
}

/** Calm empty state that points to the next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-tint text-forest">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <div className="space-y-1">
        <h3 className="font-display text-2xl text-ink">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-ink-soft">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
