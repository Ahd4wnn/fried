import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { WidgetCard } from './WidgetCard'
import { ROUTE_CALENDAR } from './routes'
import type { CalendarEvent } from './types'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const pad = (n: number) => String(n).padStart(2, '0')
const keyFor = (y: number, m: number, d: number) =>
  `${y}-${pad(m + 1)}-${pad(d)}`

interface MiniCalendarProps {
  events?: CalendarEvent[]
}

/** Compact, navigable month view with mobile horizontal week strip. // TODO(Prompt 11): wire bookings. */
export function MiniCalendar({ events = [] }: MiniCalendarProps) {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  })

  const eventDays = useMemo(() => new Set(events.map((e) => e.date)), [events])

  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const monthLabel = new Date(view.year, view.month).toLocaleDateString(
    undefined,
    {
      month: 'long',
      year: 'numeric',
    },
  )

  const step = (delta: number) =>
    setView(({ year, month }) => {
      const next = month + delta
      if (next < 0) return { year: year - 1, month: 11 }
      if (next > 11) return { year: year + 1, month: 0 }
      return { year, month: next }
    })

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  // Week strip calculation for mobile
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(today)
    const dayOfWeek = today.getDay()
    startOfWeek.setDate(today.getDate() - dayOfWeek) // Align to Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      return d
    })
  }, [today])

  const keyForDate = (date: Date) => {
    const y = date.getFullYear()
    const m = date.getMonth()
    const d = date.getDate()
    return keyFor(y, m, d)
  }

  return (
    <WidgetCard
      title="Calendar"
      to={ROUTE_CALENDAR}
      dark
      className="bg-[#1A1C1A] border border-[#2E3130] shadow-soft"
    >
      {/* Desktop View: Monthly Grid */}
      <div className="hidden sm:block">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="focus-ring rounded-full p-1.5 text-cream/50 transition-colors hover:text-cream hover:bg-cream/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-sans text-sm font-medium text-cream/80">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next month"
            className="focus-ring rounded-full p-1.5 text-cream/50 transition-colors hover:text-cream hover:bg-cream/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1 text-xs font-medium text-cream/35 tracking-wide">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />
            const isToday =
              day === today.getDate() &&
              view.month === today.getMonth() &&
              view.year === today.getFullYear()
            const hasEvent = eventDays.has(keyFor(view.year, view.month, day))
            return (
              <button
                key={day}
                type="button"
                onClick={() => navigate(ROUTE_CALENDAR)}
                aria-label={`${monthLabel} ${day}${hasEvent ? ', has sessions' : ''}`}
                className={cn(
                  'focus-ring relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all',
                  isToday
                    ? 'bg-cream text-ink font-semibold'
                    : 'text-cream/75 hover:bg-cream/12 hover:text-cream',
                )}
              >
                {day}
                {hasEvent && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full',
                      isToday ? 'bg-forest' : 'bg-accent-sage-deep',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 pt-3 border-t border-cream/10">
          <span className="flex items-center gap-1.5 text-xs text-cream/40">
            <span className="h-2 w-2 rounded-full bg-cream/70 inline-block" />
            Current day
          </span>
          <span className="flex items-center gap-1.5 text-xs text-cream/40">
            <span className="h-2 w-2 rounded-full bg-accent-sage-deep inline-block" />
            Scheduled
          </span>
        </div>
      </div>

      {/* Mobile View: Horizontal Week Strip */}
      <div className="sm:hidden">
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="py-1 text-xs font-medium text-cream/35">
              {w}
            </div>
          ))}
          {weekDays.map((date, i) => {
            const isToday =
              date.getDate() === today.getDate() &&
              date.getMonth() === today.getMonth() &&
              date.getFullYear() === today.getFullYear()
            const hasEvent = eventDays.has(keyForDate(date))
            return (
              <button
                key={i}
                type="button"
                onClick={() => navigate(ROUTE_CALENDAR)}
                aria-label={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}${hasEvent ? ', has sessions' : ''}`}
                className={cn(
                  'focus-ring relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all',
                  isToday
                    ? 'bg-cream text-ink font-semibold'
                    : 'text-cream/75 hover:bg-cream/12',
                )}
              >
                {date.getDate()}
                {hasEvent && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full',
                      isToday ? 'bg-forest' : 'bg-accent-sage-deep',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </WidgetCard>
  )
}
