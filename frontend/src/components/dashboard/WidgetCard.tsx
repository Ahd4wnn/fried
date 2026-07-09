import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Card } from '../ui'

interface WidgetCardProps {
  title: string
  /** Optional "View" link to the widget's full section. */
  to?: string
  viewLabel?: string
  className?: string
  flat?: boolean
  dark?: boolean
  accent?: 'sage' | 'sky' | 'lavender' | 'apricot' | 'butter' | 'blush' | 'forest-tint'
  headerRight?: ReactNode
  children: ReactNode
}

export function WidgetCard({
  title,
  to,
  viewLabel = 'View',
  className,
  flat = false,
  dark = false,
  accent,
  headerRight,
  children,
}: WidgetCardProps) {
  const cardClasses = flat
    ? cn('flex flex-col bg-transparent border-none shadow-none p-0', className)
    : cn(
        'flex flex-col rounded-2xl p-6 border shadow-soft transition-all duration-300 h-full',
        accent === 'sage'
          ? 'bg-accent-sage/35 border-[#7FB59A]/25 text-ink'
          : accent === 'sky'
            ? 'bg-accent-sky/35 border-[#8FB8D4]/25 text-ink'
            : accent === 'lavender'
              ? 'bg-[#ECE6F7]/60 border-[#B7A6E0]/20 text-ink'
              : accent === 'apricot'
                ? 'bg-[#FBE3D0]/60 border-[#E8A87C]/20 text-ink'
                : accent === 'butter'
                  ? 'bg-accent-butter/30 border-[#E6C65C]/20 text-ink'
                  : accent === 'blush'
                    ? 'bg-accent-blush/35 border-[#E1A7B5]/25 text-ink'
                    : accent === 'forest-tint'
                      ? 'bg-forest-tint/40 border-forest/15 text-ink'
                      : dark
                        ? 'bg-[#1A1C1A] border-ink/40 text-cream'
                        : 'bg-paper border-line/65 text-ink',
        className,
      )

  return (
    <Card className={cardClasses}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl font-normal leading-none">
            {title}
          </h2>
          {headerRight}
        </div>
        {to && (
          <Link
            to={to}
            className={cn(
              'focus-ring inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium transition-colors',
              dark
                ? 'text-accent-lavender hover:text-accent-lavender/80'
                : 'text-forest hover:text-forest-deep',
            )}
          >
            {viewLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-between">{children}</div>
    </Card>
  )
}
