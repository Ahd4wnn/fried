import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface AppShellProps {
  children: ReactNode
  className?: string
}

/** Top-level app frame on cream. No horizontal overflow at any breakpoint. */
export function AppShell({ children, className }: AppShellProps) {
  return (
    <div
      className={cn(
        'min-h-svh w-full overflow-x-hidden bg-cream text-ink',
        className,
      )}
    >
      {children}
    </div>
  )
}
