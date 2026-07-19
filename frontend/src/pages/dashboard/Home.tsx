import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { WelcomeHero } from '../../components/dashboard/WelcomeHero'
import { QuickActions } from '../../components/dashboard/QuickActions'
import { RecentSessions } from '../../components/dashboard/RecentSessions'
import { MiniCalendar } from '../../components/dashboard/MiniCalendar'
import { TodayReminders } from '../../components/dashboard/TodayReminders'
import { UpcomingSessionCard } from '../../components/dashboard/UpcomingSession'
import { GroundingCard } from '../../components/dashboard/GroundingCard'
import { ProfileNudge } from '../../components/dashboard/ProfileNudge'
import { staggerChildren, fadeUp } from '../../motion/presets'
import { api } from '../../lib/api'
import { isJoinable } from '../../lib/liveSession'
import type { SessionSummary } from '../../components/dashboard/types'
import type { UpcomingSession } from '../../components/dashboard/types'

/**
 * Seeker dashboard home. Redesigned to feel warm, premium, and joyful
 * with an asymmetric Bento layout, subtle entrance animations, and tactile cards.
 */
export default function DashboardHome() {
  const { data: aiSessions, isLoading } = useQuery({
    queryKey: ['ai-sessions'],
    queryFn: () => api.getAISessions(),
  })

  const { data: bookings } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api.getMyBookings(),
    retry: false,
  })

  const { data: liveSessions } = useQuery({
    queryKey: ['live-sessions'],
    queryFn: () => api.getLiveSessions(),
    retry: false,
  })

  // Derive next upcoming confirmed/pending booking for the widget. A session
  // stays here while its join window is open, so "Join" works mid-session.
  // eslint-disable-next-line react-hooks/purity -- time-based partition of fetched bookings; recomputing per render is intended
  const now = Date.now()
  const nextBooking = (bookings ?? [])
    .filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'pending_payment') &&
        new Date(b.ends_at).getTime() + 15 * 60_000 > now,
    )
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0]

  const nextLive = nextBooking
    ? (liveSessions ?? []).find((l) => l.booking_id === nextBooking.id)
    : undefined

  const upcomingSession: UpcomingSession | null = nextBooking
    ? {
        id: nextBooking.id,
        therapistName: nextBooking.therapist_name ?? 'Therapist',
        therapistAvatarUrl: null,
        startsAt: nextBooking.starts_at,
        modality: nextBooking.modality as 'video' | 'audio' | 'chat',
        joinable: isJoinable(nextBooking, nextLive),
      }
    : null

  const mappedSessions: SessionSummary[] = (aiSessions || []).map((s) => ({
    id: s.id,
    kind: 'ai' as const,
    startedAt: s.started_at,
    label: s.title || 'AI Companion Session',
    status:
      s.status === 'active' ? ('active' as const) : ('completed' as const),
  }))

  return (
    <motion.div
      variants={staggerChildren}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-6xl space-y-6 px-1"
    >
      <ProfileNudge />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Row 1: Start a Session Hero (12 cols) */}
        <motion.div variants={fadeUp} className="col-span-12">
          <WelcomeHero />
        </motion.div>

        {/* Row 2: QuickActions (12 cols) - floats borderless, centered */}
        <motion.div
          variants={fadeUp}
          className="col-span-12 py-1 flex items-center justify-start sm:justify-center"
        >
          <QuickActions />
        </motion.div>

        {/* Row 3: Upcoming Session (4) + Calendar (4) + Reminders (4) */}
        <motion.div
          variants={fadeUp}
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="col-span-12 lg:col-span-4 flex flex-col"
        >
          <UpcomingSessionCard session={upcomingSession} />
        </motion.div>

        <motion.div
          variants={fadeUp}
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="col-span-12 lg:col-span-4 flex flex-col"
        >
          <MiniCalendar />
        </motion.div>

        <motion.div
          variants={fadeUp}
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="col-span-12 lg:col-span-4 flex flex-col"
        >
          <TodayReminders />
        </motion.div>

        {/* Row 4: Recent Sessions (8) + Grounding (4) */}
        <motion.div
          variants={fadeUp}
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="col-span-12 lg:col-span-8 flex flex-col"
        >
          <RecentSessions sessions={mappedSessions} loading={isLoading} />
        </motion.div>

        <motion.div
          variants={fadeUp}
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="col-span-12 lg:col-span-4 flex flex-col"
        >
          <GroundingCard />
        </motion.div>
      </div>
    </motion.div>
  )
}
