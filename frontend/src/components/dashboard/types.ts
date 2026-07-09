// Shared dashboard data shapes. Widgets render to these so later prompts can
// wire real data without refactoring the UI.

export type SessionKind = 'ai' | 'human'

export interface SessionSummary {
  id: string
  kind: SessionKind
  /** ISO timestamp. */
  startedAt: string
  /** Short human label, e.g. "Evening check-in". */
  label: string
  status: 'active' | 'completed' | 'cancelled'
}

export interface CalendarEvent {
  id: string
  /** Date key, `YYYY-MM-DD`. */
  date: string
  title: string
  kind: SessionKind
}

export interface ActivityReminder {
  id: string
  title: string
  /** Optional gentle due hint, e.g. "Today" or "Before bed". */
  dueLabel?: string
  done: boolean
}

export interface UpcomingSession {
  id: string
  therapistName: string
  therapistAvatarUrl?: string | null
  /** ISO timestamp. */
  startsAt: string
  modality: 'video' | 'audio' | 'chat'
}
