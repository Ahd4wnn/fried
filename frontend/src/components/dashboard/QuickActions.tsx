import { Link } from 'react-router-dom'
import { MessageCircle, RotateCcw, Search, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ROUTE_START, ROUTE_THERAPISTS } from './routes'

interface ActionItem {
  to: string | null
  icon: React.ElementType
  iconBg: string
  iconColor: string
  label: string
  sublabel: string
  disabled?: boolean
}

const ACTIONS: ActionItem[] = [
  {
    to: ROUTE_START,
    icon: MessageCircle,
    iconBg: 'bg-forest',
    iconColor: 'text-cream',
    label: 'Start a session',
    sublabel: 'Talk to your AI companion',
  },
  {
    to: ROUTE_THERAPISTS,
    icon: Search,
    iconBg: 'bg-accent-sage',
    iconColor: 'text-forest',
    label: 'Find a therapist',
    sublabel: 'Browse verified professionals',
  },
  {
    to: null,
    icon: RotateCcw,
    iconBg: 'bg-line',
    iconColor: 'text-ink-soft',
    label: 'Resume last session',
    sublabel: 'Nothing to resume yet',
    disabled: true,
  },
]

export function QuickActions({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-3 w-full', className)}>
      {ACTIONS.map(({ to, icon: Icon, iconBg, iconColor, label, sublabel, disabled }) => {
        const inner = (
          <>
            {/* Colored circular icon badge — matches reference colored pill icons */}
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-soft',
                iconBg,
                iconColor,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink leading-tight">
                {label}
              </span>
              <span className="block text-xs text-ink-soft mt-0.5">{sublabel}</span>
            </div>

            {!disabled && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/8 text-ink/60 group-hover:bg-ink/14 transition-colors">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            )}
          </>
        )

        if (disabled || !to) {
          return (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-line/60 bg-paper/50 px-5 py-4 opacity-55 cursor-not-allowed select-none"
              aria-disabled="true"
            >
              {inner}
            </div>
          )
        }

        return (
          <Link
            key={label}
            to={to}
            className="focus-ring group flex items-center gap-3 rounded-2xl border border-line/60 bg-paper px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft hover:border-forest/20"
          >
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
