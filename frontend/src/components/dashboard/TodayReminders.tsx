import { ListChecks } from 'lucide-react'
import { EmptyState } from '../ui'
import { WidgetCard } from './WidgetCard'
import { ROUTE_TRACKER } from './routes'
import type { ActivityReminder } from './types'

interface TodayRemindersProps {
  activities?: ActivityReminder[]
}

/** Today's therapist-assigned activities. // TODO(Prompt 15): wire tracker. */
export function TodayReminders({ activities = [] }: TodayRemindersProps) {
  const total = activities.length
  const completed = activities.filter((a) => a.done).length
  const percentage = total > 0 ? (completed / total) * 100 : 0
  const radius = 10
  const strokeWidth = 2.5
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const progressRing =
    total > 0 ? (
      <div className="relative flex items-center justify-center h-8 w-8 select-none">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 32 32">
          <circle
            className="text-[#E8A87C]/30"
            strokeWidth={strokeWidth}
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="16"
            cy="16"
          />
          <circle
            className="text-[#E8A87C] transition-all duration-500 ease-out"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="16"
            cy="16"
          />
        </svg>
        <span className="absolute font-sans text-xs font-semibold text-[#C27A44] mt-0.5">
          {completed}
        </span>
      </div>
    ) : null

  return (
    <WidgetCard
      title="Today's activities"
      to={activities.length ? ROUTE_TRACKER : undefined}
      headerRight={progressRing}
      accent="apricot"
    >
      {activities.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No activities yet"
          description="When your therapist assigns activities, they'll show up here as gentle reminders."
          className="py-8"
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-ink-soft italic">
            {completed === total
              ? "Wonderful! You've completed everything for today."
              : 'Take your time, focus on one thing at a time.'}
          </p>

          <ul className="divide-y divide-[#E8A87C]/20 -mx-1">
            {activities.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 py-3 px-2 rounded-lg hover:bg-[#E8A87C]/10 transition-all"
              >
                {/* Colored circular icon badge per list item — from reference */}
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8A87C]/25">
                  <input
                    type="checkbox"
                    checked={a.done}
                    disabled
                    aria-label={a.title}
                    className="h-3 w-3 rounded-sm border-[#E8A87C]/60 bg-transparent accent-[#C27A44] cursor-default"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {a.title}
                  </span>
                  {a.dueLabel && (
                    <span className="block text-xs text-ink-soft mt-0.5">
                      {a.dueLabel}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  )
}
