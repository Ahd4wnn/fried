import { useEffect, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  ListChecks,
  MessageCircle,
  Settings,
  Sparkles,
  User,
  Video,
  Headphones,
  MessageSquare,
  Clock,
} from 'lucide-react'
import { Card, EmptyState } from '../../components/ui'
import { ROUTE_DASHBOARD } from '../../components/dashboard/routes'
import { api, ApiError } from '../../lib/api'
import type { Booking, LiveSessionState } from '../../lib/api'
import { cn } from '../../lib/cn'
import { loadRazorpay, type RazorpayOptions } from '../../lib/razorpay'
import { isJoinable } from '../../lib/liveSession'

const IST = 'Asia/Kolkata'

function fmtIST(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: IST,
  }).format(new Date(iso))
}

const MODALITY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  video: Video,
  audio: Headphones,
  chat: MessageSquare,
}

const STATUS_STYLES: Record<string, string> = {
  pending_payment: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  confirmed: 'bg-forest-tint text-forest border-forest/20',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  completed: 'bg-ink/5 text-ink-soft border-line',
  no_show: 'bg-ink/5 text-ink-soft border-line',
}

function SectionPlaceholder({
  title,
  subtitle,
  icon,
  emptyTitle,
  emptyDescription,
}: {
  title: string
  subtitle: string
  icon: ComponentType<{ className?: string }>
  emptyTitle: string
  emptyDescription: string
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-4xl text-ink">{title}</h1>
        <p className="text-ink-soft">{subtitle}</p>
      </header>
      <Card>
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
        />
      </Card>
    </div>
  )
}

export function CalendarSection() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [liveByBooking, setLiveByBooking] = useState<
    Record<string, LiveSessionState>
  >({})
  const [loading, setLoading] = useState(true)
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.getMyBookings().catch(() => [] as Booking[]),
      api.getLiveSessions().catch(() => [] as LiveSessionState[]),
    ])
      .then(([bs, lives]) => {
        setBookings(bs)
        setLiveByBooking(
          Object.fromEntries(lives.map((l) => [l.booking_id, l])),
        )
      })
      .finally(() => setLoading(false))
  }, [])

  const handlePay = async (b: Booking) => {
    setPayingBookingId(b.id)
    setPayError(null)
    try {
      const order = await api.createPaymentOrder(b.id)
      const scriptLoaded = await loadRazorpay()
      if (!scriptLoaded) {
        throw new Error('Failed to load Razorpay payment gateway script.')
      }
      if (!import.meta.env.VITE_RAZORPAY_KEY_ID) {
        throw new Error('Payments are not configured. Please contact support.')
      }

      let meEmail = ''
      let meName = ''
      try {
        const me = await api.getMe()
        meEmail = me.email ?? ''
        meName = me.display_name ?? ''
      } catch {
        // silent fallback
      }

      const options: RazorpayOptions = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount_paise,
        currency: order.currency,
        name: 'Hovio',
        description: `Therapy Session with ${b.therapist_name ?? 'Therapist'}`,
        order_id: order.razorpay_order_id,
        prefill: {
          name: meName,
          email: meEmail,
        },
        theme: {
          color: '#1C5C32',
        },
        handler: async function (response) {
          setPayingBookingId(b.id)
          setPayError(null)
          try {
            await api.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            // Reload bookings list
            const updated = await api.getMyBookings()
            setBookings(updated)
          } catch (err) {
            setPayError(err instanceof ApiError ? err.message : 'Payment verification failed.')
          } finally {
            setPayingBookingId(null)
          }
        },
        modal: {
          ondismiss: function () {
            setPayingBookingId(null)
          },
        },
      }

      if (!window.Razorpay) {
        throw new Error('Failed to load Razorpay payment gateway script.')
      }
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (resp) {
        setPayError(resp.error.description || 'Payment failed.')
        setPayingBookingId(null)
      })

      rzp.open()
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : (err as Error).message || 'Checkout failed.')
      setPayingBookingId(null)
    }
  }

  // eslint-disable-next-line react-hooks/purity -- time-based partition of fetched bookings; recomputing per render is intended
  const now = Date.now()
  // A confirmed booking stays "upcoming" while its join window is still open,
  // so an in-progress session keeps its Join button.
  const windowStillOpen = (b: Booking) =>
    new Date(b.ends_at).getTime() + 15 * 60_000 > now
  const upcoming = bookings
    .filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'pending_payment') &&
        windowStillOpen(b),
    )
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const past = bookings
    .filter(
      (b) =>
        b.status === 'completed' ||
        b.status === 'cancelled' ||
        b.status === 'no_show' ||
        !windowStillOpen(b),
    )
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, 5)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-4xl text-ink">Calendar</h1>
        <p className="text-ink-soft">Your sessions, all in one place. (All times in IST)</p>
      </header>

      {loading ? (
        <Card>
          <div className="space-y-3 p-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-line/40" />
            ))}
          </div>
        </Card>
      ) : bookings.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Nothing scheduled"
            description="Once you book sessions with a therapist, they'll show up here."
            action={
              <Link
                to="/therapists"
                className="focus-ring inline-block rounded-sm text-sm font-medium text-forest underline underline-offset-4"
              >
                Browse therapists
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Upcoming
              </h2>
              {payError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
                  {payError}
                </div>
              )}
              {upcoming.map((b) => {
                const Icon = MODALITY_ICON[b.modality] ?? Video
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-4 rounded-2xl border border-line/60 bg-paper p-4 shadow-soft"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-tint text-forest">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">Session</p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        <Clock className="inline h-3 w-3 mr-0.5 -mt-px" />
                        {fmtIST(b.starts_at)} IST
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize',
                          STATUS_STYLES[b.status] ?? '',
                        )}
                      >
                        {b.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-ink-soft capitalize">{b.modality}</span>
                      {b.status === 'pending_payment' && (
                        <button
                          type="button"
                          onClick={() => handlePay(b)}
                          disabled={payingBookingId !== null}
                          className="mt-1.5 rounded-full bg-forest px-3.5 py-1.5 text-[10px] font-semibold text-white hover:bg-forest-deep transition-all disabled:opacity-50 active:scale-[0.98]"
                        >
                          {payingBookingId === b.id ? 'Processing...' : 'Pay now'}
                        </button>
                      )}
                      {b.status === 'confirmed' &&
                        (isJoinable(b, liveByBooking[b.id]) ? (
                          <Link
                            to={`/session/${b.id}`}
                            className="mt-1.5 rounded-full bg-forest px-3.5 py-1.5 text-[10px] font-semibold text-white hover:bg-forest-deep transition-all active:scale-[0.98]"
                          >
                            Join session
                          </Link>
                        ) : (
                          <span className="mt-1.5 text-[10px] text-ink-soft">
                            Join opens 10 min before
                          </span>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Past sessions
              </h2>
              {past.map((b) => {
                const Icon = MODALITY_ICON[b.modality] ?? Video
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-4 rounded-2xl border border-line/60 bg-paper/60 p-4 opacity-70"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-soft">
                        Session
                        {liveByBooking[b.id]?.duration_minutes != null && (
                          <span className="text-xs text-ink-soft/60">
                            {' '}· {liveByBooking[b.id].duration_minutes} min
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-soft/60 mt-0.5">{fmtIST(b.starts_at)} IST</p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize',
                        STATUS_STYLES[b.status] ?? '',
                      )}
                    >
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TrackerSection() {
  return (
    <SectionPlaceholder
      title="Tracker"
      subtitle="Your care plan and progress."
      icon={ListChecks}
      emptyTitle="No activities yet"
      emptyDescription="Your therapist can assign gentle activities here. The tracker arrives in a later step."
    />
  )
}

export function SettingsSection() {
  return (
    <SectionPlaceholder
      title="Settings"
      subtitle="Privacy, notifications, and more."
      icon={Settings}
      emptyTitle="Settings coming soon"
      emptyDescription="You’ll manage your consents, notifications, and account here in a later step."
    />
  )
}

export function ProfileSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-4xl text-ink">Profile</h1>
          <p className="text-ink-soft">How you show up on Hovio.</p>
        </div>
        <Link
          to="/dashboard/settings"
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-forest-300/15 bg-paper text-forest shadow-soft hover:bg-forest-tint transition-all lg:hidden"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </header>
      <Card>
        <EmptyState
          icon={User}
          title="Profile coming soon"
          description="You’ll be able to edit your name and preferences here in a later step."
        />
      </Card>
    </div>
  )
}

/** The "Start session" destination — the AI companion chat lands in Prompt 7. */
export function StartSession() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-tint text-forest">
        <Sparkles className="h-7 w-7" />
      </span>
      <h1 className="font-display text-3xl text-ink">
        Your companion is almost ready
      </h1>
      <p className="max-w-md text-ink-soft">
        This is where you’ll talk with your AI companion — a calm, private space
        to think things through. We’re putting the finishing touches on it.
      </p>
      <Link
        to={ROUTE_DASHBOARD}
        className="focus-ring inline-flex items-center gap-2 rounded-sm text-sm font-medium text-forest underline underline-offset-4"
      >
        <MessageCircle className="h-4 w-4" />
        Back to home
      </Link>
    </div>
  )
}
