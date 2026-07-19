import { useCallback, useEffect, useState } from 'react'
import type { ElementType } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Calendar,
  Filter,
  Globe,
  IndianRupee,
  Search,
  User,
  Video,
  Headphones,
  MessageSquare,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { TherapistListItem, Slot, TherapistFilters } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Sheet } from '../components/ui/Sheet'
import { Spinner } from '../components/ui/Spinner'
import { cn } from '../lib/cn'
import { loadRazorpay, type RazorpayOptions } from '../lib/razorpay'
import { motion, AnimatePresence } from 'motion/react'

// ─── Constants ────────────────────────────────────────────────────────────────

const IST = 'Asia/Kolkata'

// Native Intl helpers (avoids date-fns-tz dependency)
function toISTTimeStr(isoStr: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: IST,
  }).format(new Date(isoStr))
}

function toISTDateStr(isoStr: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short',
    timeZone: IST,
  }).format(new Date(isoStr))
}

function toISTDayKey(isoStr: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: IST,
  }).format(new Date(isoStr)) // returns yyyy-MM-dd
}

function toISTDateTimeStr(isoStr: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    day: 'numeric', month: 'short',
    timeZone: IST,
  }).format(new Date(isoStr))
}

const SPECIALIZATION_OPTIONS = [
  'anxiety', 'depression', 'stress', 'grief', 'trauma', 'relationships',
  'career', 'addiction', 'ocd', 'ptsd', 'sleep', 'parenting',
]

const LANGUAGE_OPTIONS = ['english', 'hindi', 'tamil', 'bengali', 'telugu', 'marathi']

const MODALITY_ICONS: Record<string, ElementType> = {
  video: Video,
  audio: Headphones,
  chat: MessageSquare,
}

// ─── Gradient seed → each therapist gets a unique but stable banner gradient ──

const BANNER_GRADIENTS = [
  'from-[#1C5C32] via-[#2D8B52] to-[#0E2D19]',
  'from-[#0f3d2e] via-[#1a7a53] to-[#0a2018]',
  'from-[#1e4d3b] via-[#2e9e6c] to-[#153326]',
  'from-[#134529] via-[#1C5C32] to-[#0b2c1a]',
  'from-[#0d3b2b] via-[#246647] to-[#0a2419]',
]

function getBannerGradient(id: string) {
  const idx = id.charCodeAt(0) % BANNER_GRADIENTS.length
  return BANNER_GRADIENTS[idx]
}

// ─── Therapist card ───────────────────────────────────────────────────────────

function TherapistCard({
  t,
  onBook,
}: {
  t: TherapistListItem
  onBook: (t: TherapistListItem) => void
}) {
  const initials = (t.display_name ?? 'T')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const gradient = getBannerGradient(t.id)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col overflow-hidden rounded-[28px] border border-line/50 bg-paper shadow-soft hover:shadow-lift transition-all duration-300 hover:-translate-y-1"
    >
      {/* ── Banner ── */}
      <div className={`relative h-[130px] w-full bg-gradient-to-br ${gradient} overflow-hidden`}>
        {/* Noise grain overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 512 512\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.18\'/%3E%3C/svg%3E")',
            backgroundSize: 'cover',
            mixBlendMode: 'overlay',
          }}
        />
        {/* Glowing blobs */}
        <div className="pointer-events-none absolute -top-6 -right-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-16 w-16 rounded-full bg-white/8 blur-xl" />

        {/* Modality pills — top right */}
        {t.session_modes.length > 0 && (
          <div className="absolute top-3 right-3 flex gap-1">
            {t.session_modes.slice(0, 2).map((m) => {
              const Icon = MODALITY_ICONS[m] ?? Video
              return (
                <span
                  key={m}
                  className="flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/20 px-2 py-1 text-[10px] font-semibold text-white capitalize"
                >
                  <Icon className="h-2.5 w-2.5" />
                  {m}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Avatar overlapping banner ── */}
      <div className="-mt-[34px] px-5 flex items-end justify-between">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="h-[68px] w-[68px] rounded-full border-[3px] border-paper overflow-hidden bg-gradient-to-br from-forest to-forest-deep shadow-md flex items-center justify-center">
            {t.avatar_url ? (
              <img
                src={t.avatar_url}
                alt={t.display_name ?? ''}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const fallback = document.createElement('span');
                    fallback.className = 'text-xl font-bold text-white';
                    fallback.innerText = initials;
                    parent.appendChild(fallback);
                  }
                }}
              />
            ) : (
              <span className="text-xl font-bold text-white">{initials}</span>
            )}
          </div>
          {/* "Verified" dot */}
          <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full bg-forest border-2 border-paper block" />
        </div>

        {/* Shortlist bookmark — top right of content */}
        <button
          aria-label="Shortlist"
          className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper/80 backdrop-blur-sm text-ink-soft hover:border-forest hover:text-forest transition-all"
        >
          <Bookmark className="h-4 w-4" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col flex-1 px-5 pb-5 pt-3 gap-4">
        {/* Name + title */}
        <div>
          <h3 className="font-fraunces text-xl font-medium text-ink leading-tight tracking-tight">
            {t.display_name ?? 'Therapist'}
          </h3>
          <p className="text-xs text-ink-soft mt-1 leading-snug">
            {t.professional_title ?? 'Mental health professional'}
          </p>
        </div>

        {/* Spec tags */}
        {t.specializations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {t.specializations.slice(0, 3).map((s) => (
              <span
                key={s}
                className="rounded-full bg-forest-tint border border-forest/15 px-2.5 py-0.5 text-[10px] font-medium text-forest capitalize"
              >
                {s}
              </span>
            ))}
            {t.specializations.length > 3 && (
              <span className="rounded-full bg-line/50 px-2.5 py-0.5 text-[10px] font-medium text-ink-soft">
                +{t.specializations.length - 3}
              </span>
            )}
          </div>
        )}

        {/* ── Stats row ── */}
        <div className="flex items-center justify-between border-t border-line/40 pt-3.5 mt-auto">
          {t.price_inr != null && (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-tint/70 text-forest">
                <IndianRupee className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-ink-soft/70 uppercase tracking-wider font-semibold leading-none font-sans">Price</span>
                <span className="text-xs font-bold text-ink mt-0.5 font-sans">₹{t.price_inr}</span>
              </div>
            </div>
          )}
          {t.languages.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-tint/70 text-forest">
                <Globe className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-ink-soft/70 uppercase tracking-wider font-semibold leading-none font-sans">Lang</span>
                <span className="text-xs font-bold text-ink mt-0.5 font-sans">
                  {t.languages[0].slice(0, 3).toUpperCase()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── CTA pill ── */}
        <button
          onClick={() => onBook(t)}
          className="group/btn flex w-full items-center rounded-full bg-ink text-cream py-3 px-4 transition-all hover:bg-forest active:scale-[0.98]"
        >
          {/* Circle arrow */}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream/15 transition-transform group-hover/btn:translate-x-0.5">
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 text-center text-sm font-semibold -ml-7 font-sans">
            Book a session
          </span>
        </button>
      </div>
    </motion.div>
  )
}

// ─── Slot picker ──────────────────────────────────────────────────────────────

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const DAYS_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function getISTToday() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: IST,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  const parts = formatter.formatToParts(now)
  const r: Record<string, string> = {}
  parts.forEach((p) => {
    r[p.type] = p.value
  })
  return {
    year: parseInt(r.year, 10),
    month: parseInt(r.month, 10), // 1-based (1-12)
    day: parseInt(r.day, 10),
  }
}

function getISTWeekday(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: IST,
    weekday: 'short',
  })
  const val = formatter.format(d)
  return DAYS_MAP[val] ?? 0
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function getMonthName(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function getCalendarWeeks(year: number, month: number) {
  const firstDayOfWeek = getISTWeekday(year, month, 1)
  const currentMonthDays = getDaysInMonth(year, month)

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevMonthDays = getDaysInMonth(prevYear, prevMonth)

  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const cells: {
    day: number
    month: number
    year: number
    isCurrentMonth: boolean
    dateKey: string
  }[] = []

  // Previous month leading days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    cells.push({
      day,
      month: prevMonth,
      year: prevYear,
      isCurrentMonth: false,
      dateKey: toDateKey(prevYear, prevMonth, day),
    })
  }

  // Current month days
  for (let day = 1; day <= currentMonthDays; day++) {
    cells.push({
      day,
      month,
      year,
      isCurrentMonth: true,
      dateKey: toDateKey(year, month, day),
    })
  }

  // Next month trailing days
  const totalCells = cells.length > 35 ? 42 : 35
  const remaining = totalCells - cells.length
  for (let day = 1; day <= remaining; day++) {
    cells.push({
      day,
      month: nextMonth,
      year: nextYear,
      isCurrentMonth: false,
      dateKey: toDateKey(nextYear, nextMonth, day),
    })
  }

  // Split into weeks of 7 days
  const weeks: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

// ─── Slot picker ──────────────────────────────────────────────────────────────

function SlotPicker({
  therapist,
  onClose,
  onBooked,
}: {
  therapist: TherapistListItem
  onClose: () => void
  onBooked: () => void
}) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [selectedModality, setSelectedModality] = useState<string>(
    therapist.session_modes[0] ?? 'video',
  )
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Wizard state
  const [step, setStep] = useState<'date' | 'time'>('date')
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState<{ year: number; month: number }>(() => {
    const today = getISTToday()
    return { year: today.year, month: today.month }
  })

  useEffect(() => {
    let active = true
    api
      .getTherapistSlots(therapist.id)
      .then((s) => { if (active) setSlots(s) })
      .catch(() => {})
      .finally(() => { if (active) setLoadingSlots(false) })
    return () => { active = false }
  }, [therapist.id])

  // Group slots by day (in IST)
  const byDay = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    const day = toISTDayKey(s.starts_at)
    if (!acc[day]) acc[day] = []
    acc[day].push(s)
    return acc
  }, {})

  const handleBook = async () => {
    if (!selectedSlot) return
    setError(null)
    setBooking(true)
    try {
      // 1. Create pending_payment booking
      const bookingObj = await api.createBooking({
        therapist_id: therapist.id,
        starts_at: selectedSlot.starts_at,
        modality: selectedModality,
      })

      // 2. Create Razorpay order
      const order = await api.createPaymentOrder(bookingObj.id)

      // 3. Load Razorpay script
      const scriptLoaded = await loadRazorpay()
      if (!scriptLoaded) {
        throw new Error('Failed to load Razorpay payment gateway script.')
      }
      if (!import.meta.env.VITE_RAZORPAY_KEY_ID) {
        throw new Error('Payments are not configured. Please contact support.')
      }

      // Prefill seeker name/email
      let meEmail = ''
      let meName = ''
      try {
        const me = await api.getMe()
        meEmail = me.email ?? ''
        meName = me.display_name ?? ''
      } catch {
        // fail silent prefill
      }

      // 4. Configure Razorpay Options
      const options: RazorpayOptions = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount_paise,
        currency: order.currency,
        name: 'Hovio',
        description: `Therapy Session with ${therapist.display_name ?? 'Therapist'}`,
        order_id: order.razorpay_order_id,
        prefill: {
          name: meName,
          email: meEmail,
        },
        theme: {
          color: '#1C5C32',
        },
        handler: async function (response) {
          setBooking(true)
          setError(null)
          try {
            await api.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            setBooked(true)
            setTimeout(onBooked, 1800)
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Payment verification failed.')
          } finally {
            setBooking(false)
          }
        },
        modal: {
          ondismiss: function () {
            setBooking(false)
            setError('Payment cancelled. You can retry paying for this session from your calendar dashboard.')
          },
        },
      }

      if (!window.Razorpay) {
        throw new Error('Failed to load Razorpay payment gateway script.')
      }
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (resp) {
        setError(resp.error.description || 'Payment failed.')
        setBooking(false)
      })

      setBooking(false)
      rzp.open()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message || 'Checkout failed.')
      setBooking(false)
    }
  }

  // Pre-calculate variables
  const today = getISTToday()
  const weeks = getCalendarWeeks(currentMonth.year, currentMonth.month)
  const daySlots = selectedDateKey ? (byDay[selectedDateKey] ?? []) : []

  const isPrevDisabled =
    currentMonth.year < today.year ||
    (currentMonth.year === today.year && currentMonth.month <= today.month)

  const handlePrevMonth = () => {
    if (isPrevDisabled) return
    setCurrentMonth((prev) => {
      const month = prev.month === 1 ? 12 : prev.month - 1
      const year = prev.month === 1 ? prev.year - 1 : prev.year
      return { year, month }
    })
  }

  const handleNextMonth = () => {
    setCurrentMonth((prev) => {
      const month = prev.month === 12 ? 1 : prev.month + 1
      const year = prev.month === 12 ? prev.year + 1 : prev.year
      return { year, month }
    })
  }

  return (
    <Sheet open onClose={onClose} title={`Book with ${therapist.display_name ?? 'Therapist'}`}>
      <div className="flex flex-col gap-5 pb-6">
        {/* Price & modes */}
        <div className="flex items-center justify-between rounded-2xl bg-forest-tint border border-forest/20 px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-forest">
            <IndianRupee className="h-4 w-4" />
            {therapist.price_inr ?? '—'} <span className="font-normal text-ink-soft">/session</span>
          </span>
          <div className="flex gap-1.5">
            {therapist.session_modes.map((m) => {
              const Icon = MODALITY_ICONS[m] ?? Video
              return (
                <button
                  key={m}
                  onClick={() => setSelectedModality(m)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all',
                    selectedModality === m
                      ? 'bg-forest border-forest text-white'
                      : 'border-forest/30 bg-paper text-forest hover:bg-forest-tint',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {m}
                </button>
              )
            })}
          </div>
        </div>

        {/* Slot selector steps */}
        {loadingSlots ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6 text-forest" />
          </div>
        ) : slots.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ink-soft">
            <Calendar className="h-8 w-8 opacity-40" />
            <p>No open slots available right now. Check back soon.</p>
          </div>
        ) : (
          <>
            {/* Step 1: Date Selection */}
            {step === 'date' && (
              <div className="space-y-4">
                {/* Calendar Header with Navigation */}
                <div className="flex items-center justify-between border-b border-line/40 pb-3">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    disabled={isPrevDisabled}
                    className={cn(
                      "p-1.5 rounded-full border border-line/60 bg-paper transition-all hover:bg-forest-tint",
                      isPrevDisabled ? "opacity-35 cursor-not-allowed" : "hover:border-forest text-ink"
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h3 className="text-sm font-semibold text-ink">
                    {getMonthName(currentMonth.year, currentMonth.month)}
                  </h3>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-full border border-line/60 bg-paper transition-all hover:bg-forest-tint hover:border-forest text-ink"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Weekdays Labels */}
                <div className="grid grid-cols-7 gap-1.5 text-center mb-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="flex flex-col gap-1.5">
                  {weeks.map((week, wIdx) => (
                    <div key={wIdx} className="grid grid-cols-7 gap-1.5">
                      {week.map((cell) => {
                        const hasSlots = byDay[cell.dateKey] && byDay[cell.dateKey].length > 0
                        const isSelected = selectedDateKey === cell.dateKey
                        const isCellToday =
                          cell.year === today.year &&
                          cell.month === today.month &&
                          cell.day === today.day

                        return (
                          <button
                            key={cell.dateKey}
                            type="button"
                            disabled={!hasSlots}
                            onClick={() => {
                              setSelectedDateKey(cell.dateKey)
                              setSelectedSlot(null)
                              setStep('time')
                            }}
                            className={cn(
                              "relative aspect-square w-full flex flex-col items-center justify-center rounded-xl text-xs font-semibold transition-all border",
                              // Has slots vs doesn't
                              hasSlots
                                ? isSelected
                                  ? "bg-forest border-forest text-white shadow-sm"
                                  : "bg-forest-tint/40 border-forest/20 hover:border-forest hover:bg-forest-tint text-forest cursor-pointer"
                                : "bg-transparent border-transparent text-ink-soft/30 cursor-default pointer-events-none",
                              // Month belonging text transparency
                              !cell.isCurrentMonth && !isSelected && "opacity-40",
                              // Today highlight
                              isCellToday && !isSelected && "ring-1 ring-forest/40"
                            )}
                          >
                            <span>{cell.day}</span>
                            {/* Dot indicator for slots if not selected */}
                            {hasSlots && !isSelected && (
                              <span className="absolute bottom-1 h-1 w-1 rounded-full bg-forest" />
                            )}
                            {/* Dot indicator if selected */}
                            {hasSlots && isSelected && (
                              <span className="absolute bottom-1 h-1 w-1 rounded-full bg-white" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Time Selection */}
            {step === 'time' && (
              <div className="space-y-4">
                {/* Header / Back button */}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('date')
                      setSelectedSlot(null)
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-forest hover:underline w-fit"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to calendar
                  </button>
                  <h3 className="text-sm font-semibold text-ink mt-1">
                    Slots for {daySlots.length > 0 ? toISTDateStr(daySlots[0].starts_at) : 'Selected Date'}
                  </h3>
                </div>

                {/* Time slot grid */}
                {daySlots.length === 0 ? (
                  <div className="text-center py-6 text-sm text-ink-soft">
                    No slots found for this date.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {daySlots.map((slot) => {
                      const timeIST = toISTTimeStr(slot.starts_at)
                      const isSelected = selectedSlot?.id === slot.id
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedSlot(isSelected ? null : slot)}
                          className={cn(
                            'rounded-xl border py-2.5 text-xs font-medium transition-all text-center',
                            isSelected
                              ? 'bg-forest border-forest text-white shadow-md'
                              : 'border-line bg-paper text-ink hover:border-forest hover:bg-forest-tint',
                          )}
                        >
                          {timeIST} <span className="text-[10px] opacity-60 block mt-0.5">IST</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {booked ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-forest" />
            <p className="text-sm font-semibold text-ink">Session booked!</p>
            <p className="text-xs text-ink-soft">Redirecting to your calendar…</p>
          </div>
        ) : (
          step === 'time' && selectedSlot && (
            <Button
              disabled={booking}
              onClick={handleBook}
              className="w-full"
            >
              {booking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Confirm for{' '}
                  {toISTDateTimeStr(selectedSlot.starts_at)} IST
                </>
              )}
            </Button>
          )
        )}
      </div>
    </Sheet>
  )
}

// ─── Filter sidebar ───────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: TherapistFilters
  onChange: (f: TherapistFilters) => void
  onReset: () => void
}) {
  return (
    <aside className="w-64 shrink-0 space-y-6 rounded-3xl border border-line/60 bg-paper p-5 shadow-soft h-fit sticky top-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Filters</h2>
        <button onClick={onReset} className="text-xs text-forest hover:underline">
          Reset
        </button>
      </div>

      {/* Specialization */}
      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft uppercase tracking-wider">Specialization</p>
        <div className="flex flex-wrap gap-1.5">
          {SPECIALIZATION_OPTIONS.map((s) => {
            const active = filters.specialization === s
            return (
              <button
                key={s}
                onClick={() => onChange({ ...filters, specialization: active ? undefined : s })}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] capitalize transition-all',
                  active
                    ? 'bg-forest border-forest text-white'
                    : 'border-line text-ink-soft hover:border-forest hover:text-forest',
                )}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {/* Language */}
      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft uppercase tracking-wider">Language</p>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGE_OPTIONS.map((l) => {
            const active = filters.language === l
            return (
              <button
                key={l}
                onClick={() => onChange({ ...filters, language: active ? undefined : l })}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] capitalize transition-all',
                  active
                    ? 'bg-forest border-forest text-white'
                    : 'border-line text-ink-soft hover:border-forest hover:text-forest',
                )}
              >
                {l}
              </button>
            )
          })}
        </div>
      </div>

      {/* Session mode */}
      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft uppercase tracking-wider">Session mode</p>
        <div className="flex gap-1.5">
          {['video', 'audio', 'chat'].map((m) => {
            const active = filters.modality === m
            const Icon = MODALITY_ICONS[m]
            return (
              <button
                key={m}
                onClick={() => onChange({ ...filters, modality: active ? undefined : m })}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] capitalize transition-all',
                  active
                    ? 'bg-forest border-forest text-white'
                    : 'border-line text-ink-soft hover:border-forest hover:text-forest',
                )}
              >
                <Icon className="h-3 w-3" />
                {m}
              </button>
            )
          })}
        </div>
      </div>

      {/* Max price */}
      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft uppercase tracking-wider">
          Max price (₹/session)
        </p>
        <input
          type="range"
          min={500}
          max={5000}
          step={250}
          value={filters.price_max ?? 5000}
          onChange={(e) => onChange({ ...filters, price_max: Number(e.target.value) })}
          className="w-full accent-forest"
        />
        <div className="flex justify-between text-[11px] text-ink-soft mt-1">
          <span>₹500</span>
          <span className="font-medium text-ink">
            {filters.price_max === 5000 || filters.price_max === undefined
              ? 'Any'
              : `₹${filters.price_max}`}
          </span>
          <span>₹5000</span>
        </div>
      </div>

      {/* Available soon */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.has_availability_soon ?? false}
          onChange={(e) => onChange({ ...filters, has_availability_soon: e.target.checked || undefined })}
          className="h-4 w-4 rounded border-line accent-forest"
        />
        <span className="text-xs text-ink">Available this week</span>
      </label>
    </aside>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Therapists() {
  const [therapists, setTherapists] = useState<TherapistListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<TherapistFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const [bookingTarget, setBookingTarget] = useState<TherapistListItem | null>(null)

  const load = useCallback(async (f: TherapistFilters) => {
    setLoading(true)
    try {
      const data = await api.listTherapists(f.price_max === 5000 ? { ...f, price_max: undefined } : f)
      setTherapists(data)
    } catch {
      setTherapists([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: load() toggles its own loading flag
    load(filters)
  }, [filters, load])

  const resetFilters = () => setFilters({})

  // Client-side name search
  const visible = search.trim()
    ? therapists.filter((t) =>
        (t.display_name ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : therapists

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="font-display text-4xl text-ink">Find a therapist</h1>
        <p className="text-ink-soft">
          Browse verified professionals and book directly — no AI required.
        </p>
      </header>

      {/* Search + filter toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-soft pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-line bg-paper pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all',
            showFilters || activeFilterCount > 0
              ? 'bg-forest border-forest text-white'
              : 'border-line bg-paper text-ink hover:border-forest hover:text-forest',
          )}
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-6">
        {/* Filter sidebar */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:block"
            >
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                onReset={resetFilters}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-[420px] animate-pulse rounded-[28px] bg-line/40"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <User className="h-12 w-12 text-ink-soft/40" />
              <p className="text-ink font-medium">No therapists found</p>
              <p className="text-sm text-ink-soft max-w-xs">
                Try adjusting your filters or check back later as more therapists join.
              </p>
              <button
                onClick={resetFilters}
                className="mt-1 text-sm text-forest hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              <AnimatePresence>
                {visible.map((t) => (
                  <TherapistCard key={t.id} t={t} onBook={setBookingTarget} />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* Booking sheet */}
      <AnimatePresence>
        {bookingTarget && (
          <SlotPicker
            therapist={bookingTarget}
            onClose={() => setBookingTarget(null)}
            onBooked={() => setBookingTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
