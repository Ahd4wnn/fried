import { CalendarClock, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, Avatar } from '../ui'
import { WidgetCard } from './WidgetCard'
import { ROUTE_CALENDAR } from './routes'
import type { UpcomingSession } from './types'

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getCountdown(startsAt: string): string {
  const diffMs = new Date(startsAt).getTime() - Date.now()
  if (diffMs <= 0) return 'Starting now'
  const diffMins = Math.floor(diffMs / (1000 * 60))
  if (diffMins < 60) return `In ${diffMins}m`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `In ${diffHrs}h`
  const diffDays = Math.floor(diffHrs / 24)
  return `In ${diffDays}d`
}

interface UpcomingSessionCardProps {
  session?: UpcomingSession | null
}

/** Next booked human session. // TODO(Prompt 11/13): wire bookings + join. */
export function UpcomingSessionCard({
  session = null,
}: UpcomingSessionCardProps) {
  const countdown = session ? getCountdown(session.startsAt) : ''

  return (
    <WidgetCard
      title="Upcoming session"
      accent="lavender"
    >
      {!session ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing booked yet"
          description="When you book a session with a therapist, it'll appear here."
          className="py-6"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar
              name={session.therapistName}
              size="md"
              className="bg-[#B7A6E0]/30 text-[#6A52B5] font-medium"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-ink">
                  {session.therapistName}
                </p>
                <span className="inline-flex shrink-0 items-center rounded-full bg-[#B7A6E0]/30 px-2.5 py-0.5 text-xs font-medium text-[#5A40A8]">
                  {countdown}
                </span>
              </div>
              <p className="text-xs text-ink-soft mt-0.5">
                {formatWhen(session.startsAt)}
              </p>
            </div>
          </div>

          {/* "Get in Touch"-style pill CTA from reference. Joins the live room
              when the window is open; otherwise leads to the calendar. */}
          <Link
            to={session.joinable ? `/session/${session.id}` : ROUTE_CALENDAR}
            className={
              session.joinable
                ? 'flex w-full items-center gap-3 rounded-full bg-forest px-5 py-3 text-sm font-medium text-cream transition-all hover:bg-forest-deep'
                : 'flex w-full items-center gap-3 rounded-full bg-ink px-5 py-3 text-sm font-medium text-cream transition-all hover:bg-forest-deep'
            }
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream/15">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-center">
              {session.joinable ? 'Join session now' : 'View in calendar'}
            </span>
          </Link>
        </div>
      )}
    </WidgetCard>
  )
}
