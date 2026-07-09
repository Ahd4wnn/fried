import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'motion/react'
import { cn } from '../../lib/cn'
import type { NavItem } from './DashboardLayout'

interface DockItemProps {
  to: string
  end?: boolean
  label: string
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>
}

function DockItem({ to, end, label, Icon }: DockItemProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      className="shrink-0 flex items-center justify-center"
    >
      <NavLink
        to={to}
        end={end}
        aria-label={label}
        className={({ isActive }) =>
          cn(
            'focus-ring relative flex h-10 w-10 items-center justify-center rounded-full select-none transition-all duration-200 shrink-0 outline-none',
            isActive
              ? 'text-forest-deep'
              : 'text-ink-soft hover:bg-forest-tint/50',
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* Sliding background capsule for active links */}
            {isActive && (
              <motion.div
                layoutId="mobile-nav-active"
                className="absolute inset-0 rounded-full bg-forest-tint"
                transition={{ type: 'spring', stiffness: 380, damping: 25 }}
              />
            )}

            {/* Content (Z-indexed above highlight) */}
            <span
              className={cn(
                'relative z-10 flex items-center justify-center transition-colors',
                isActive ? 'text-forest-deep font-semibold' : 'text-ink-soft',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={2.2} />
            </span>
          </>
        )}
      </NavLink>
    </motion.div>
  )
}

interface DockProps {
  items: NavItem[]
}

/**
 * Mobile-first floating capsule tab bar for layouts (<lg).
 * Renders the same navigation items as desktop in a clean, balanced,
 * horizontal flex bar above safe areas, utilizing Framer Motion spring
 * highlights to transition between routes, and tap scales for premium native haptic feedback.
 */
export function Dock({ items }: DockProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center overflow-x-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-forest-200/20 bg-paper/90 px-2.5 py-1.5 shadow-[0_8px_32px_rgba(20,28,20,0.08)] backdrop-blur-md"
      >
        {items.map((item) => (
          <DockItem
            key={item.label}
            to={item.route}
            end={item.end}
            label={item.label}
            Icon={item.icon}
          />
        ))}
      </nav>
    </div>
  )
}
