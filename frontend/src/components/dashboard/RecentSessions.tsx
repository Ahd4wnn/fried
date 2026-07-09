import { Link } from 'react-router-dom'
import { MessageCircle, Users, ChevronRight } from 'lucide-react'
import { Badge, EmptyState, Skeleton } from '../ui'
import { WidgetCard } from './WidgetCard'
import type { SessionSummary } from './types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

interface RecentSessionsProps {
  sessions?: SessionSummary[]
  loading?: boolean
}

/** Recent AI + human sessions. Wired to navigate to active/past AI sessions. */
export function RecentSessions({
  sessions = [],
  loading = false,
}: RecentSessionsProps) {
  return (
    <WidgetCard title="Recent sessions" accent="sky">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No sessions yet"
          description="Your sessions will appear here once you start talking with your companion."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-[#8FB8D4]/25 -mx-1">
          {sessions.map((s) => {
            const isAI = s.kind === 'ai'
            const content = (
              <>
                {/* Colored circular icon badge per list row — from reference */}
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-soft ${
                    isAI
                      ? 'bg-forest text-cream'
                      : 'bg-[#8FB8D4]/30 text-[#2C6B8F]'
                  }`}
                >
                  {isAI ? (
                    <MessageCircle className="h-4 w-4" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {s.label}
                  </span>
                  <span className="block text-xs text-ink-soft mt-0.5">
                    {formatDate(s.startedAt)}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone={isAI ? 'forest' : 'neutral'}>
                    {isAI ? 'AI Companion' : 'Therapist'}
                  </Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft/60 group-hover/item:text-ink-soft group-hover/item:translate-x-0.5 transition-all" />
                </div>
              </>
            )

            if (isAI) {
              return (
                <li key={s.id}>
                  <Link
                    to={`/dashboard/session?id=${s.id}`}
                    className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-[#8FB8D4]/15 transition-all duration-200 group/item cursor-pointer"
                  >
                    {content}
                  </Link>
                </li>
              )
            }

            return (
              <li
                key={s.id}
                className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-[#8FB8D4]/15 transition-all duration-200 group/item"
              >
                {content}
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
