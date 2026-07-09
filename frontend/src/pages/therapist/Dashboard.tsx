import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles,
  User,
  Calendar,
  DollarSign,
  Clock,
  FileText,
  Lock,
  Edit,
  Shield,
  ArrowRight,
  LogOut,
  CheckCircle2,
  AlertCircle,
  XCircle,
  LayoutDashboard,
  Plus,
  X,
  Video,
  Headphones,
  MessageSquare,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { useAuth } from '../../auth/auth-context'
import { api, ApiError } from '../../lib/api'
import type {
  TherapistProfile,
  TherapistVerification,
  HandoffInvitation,
  AvailabilityBlock,
  AvailabilityBlockCreate,
} from '../../lib/api'
import { Dropdown } from '../../components/ui'
import { Spinner } from '../../components/ui/Spinner'
import type { DropdownOption } from '../../components/ui'
import { Logo } from '../../components/Logo'
import { cn } from '../../lib/cn'

type DashboardTab =
  | 'overview'
  | 'profile'
  | 'availability'
  | 'calendar'
  | 'earnings'

// ─── Sidebar nav items ───────────────────────────────────────────────────────
interface NavItem {
  id: DashboardTab
  label: string
  icon: React.ElementType
  locked?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'profile', label: 'Edit profile', icon: User },
  { id: 'availability', label: 'Availability', icon: Clock },
  { id: 'calendar', label: 'Calendar & sessions', icon: Calendar, locked: true },
  { id: 'earnings', label: 'Earnings', icon: DollarSign, locked: true },
]

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-paper border border-line/60 p-5 shadow-soft">
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          iconBg,
          iconColor,
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xl font-semibold text-ink">{value}</p>
        <p className="text-xs text-ink-soft mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─── Coming-soon locked tab ───────────────────────────────────────────────────
function LockedTab({
  icon: Icon,
  title,
  description,
  accent,
}: {
  icon: React.ElementType
  title: string
  description: string
  accent: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border p-12 text-center space-y-4 select-none',
        accent,
      )}
    >
      {/* Decorative blur blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-forest-tint opacity-60 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-accent-sage opacity-40 blur-2xl"
      />
      <div className="relative z-10 space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest/10 mx-auto">
          <Icon className="h-7 w-7 text-forest" />
        </div>
        <h3 className="font-display text-2xl font-normal text-ink">{title}</h3>
        <p className="text-sm text-ink-soft max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
        <div className="inline-flex items-center gap-2 rounded-full bg-forest-tint border border-forest/20 px-4 py-1.5 text-xs font-medium text-forest">
          <Lock className="h-3 w-3" />
          Available after verification
        </div>
      </div>
    </div>
  )
}

// ─── Availability tab component ───────────────────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const IST_TZ = 'Asia/Kolkata'

function AvailabilityTab({ showToast }: { showToast: (msg: string) => void }) {
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form state
  const [isRecurring, setIsRecurring] = useState(true)
  const [dayOfWeek, setDayOfWeek] = useState<number>(1)
  const [specificDate, setSpecificDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')

  const loadBlocks = async () => {
    try {
      const data = await api.getAvailabilityBlocks()
      setBlocks(data)
    } catch {
      /* swallow */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBlocks() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startTime || !endTime) return
    setSaving(true)
    try {
      const payload: AvailabilityBlockCreate = {
        is_recurring: isRecurring,
        day_of_week: isRecurring ? dayOfWeek : null,
        specific_date: !isRecurring ? specificDate : null,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        timezone: IST_TZ,
        active: true,
      }
      await api.createAvailabilityBlock(payload)
      showToast('Availability block added and slots generated.')
      setShowForm(false)
      await loadBlocks()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to create block.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (block: AvailabilityBlock) => {
    try {
      await api.updateAvailabilityBlock(block.id, { active: !block.active })
      showToast(block.active ? 'Block paused.' : 'Block re-activated.')
      await loadBlocks()
    } catch {
      showToast('Failed to update block.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this availability block? This will remove future generated slots.')) return
    setDeletingId(id)
    try {
      await api.deleteAvailabilityBlock(id)
      showToast('Block deleted.')
      await loadBlocks()
    } catch {
      showToast('Failed to delete block.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl font-normal text-ink">Availability</h2>
          <p className="text-sm text-ink-soft mt-0.5">
            All times shown in IST (Asia/Kolkata). Slots auto-generate for the next 4 weeks.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-full bg-ink text-cream px-4 py-2 text-sm font-medium hover:bg-forest-deep transition-all shadow"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Add block'}
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            onSubmit={handleCreate}
            className="rounded-2xl border border-line/60 bg-paper p-6 shadow-soft space-y-5"
          >
            <h3 className="font-semibold text-ink text-sm">New availability block</h3>

            {/* Recurring / one-off toggle */}
            <div className="flex gap-2">
              {[
                { val: true, label: 'Weekly (recurring)' },
                { val: false, label: 'One-off date' },
              ].map(({ val, label }) => (
                <button
                  type="button"
                  key={String(val)}
                  onClick={() => setIsRecurring(val)}
                  className={cn(
                    'flex-1 rounded-xl border py-2 text-sm transition-all font-medium',
                    isRecurring === val
                      ? 'bg-forest border-forest text-white'
                      : 'border-line text-ink-soft hover:border-forest hover:text-forest',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Day selector or date picker */}
            {isRecurring ? (
              <div>
                <label className="block text-xs text-ink-soft mb-1.5 font-medium uppercase tracking-wider">
                  Day of week
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, i) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setDayOfWeek(i)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                        dayOfWeek === i
                          ? 'bg-forest border-forest text-white'
                          : 'border-line text-ink-soft hover:border-forest hover:text-forest',
                      )}
                    >
                      {d.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-ink-soft mb-1.5 font-medium uppercase tracking-wider">
                  Date (IST)
                </label>
                <input
                  type="date"
                  required
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:ring-2 focus:ring-forest/20 transition-all"
                />
              </div>
            )}

            {/* Times */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-ink-soft mb-1.5 font-medium uppercase tracking-wider">
                  Start time (IST)
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:ring-2 focus:ring-forest/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-1.5 font-medium uppercase tracking-wider">
                  End time (IST)
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:ring-2 focus:ring-forest/20 transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-line px-4 py-2 text-sm text-ink-soft hover:text-ink transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-full bg-forest px-5 py-2 text-sm font-medium text-white hover:bg-forest-deep transition-all disabled:opacity-60"
              >
                {saving && <Spinner className="h-3.5 w-3.5" />}
                Save block
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Blocks list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-line/40" />
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center border border-dashed border-line rounded-2xl">
          <Clock className="h-10 w-10 text-ink-soft/40" />
          <p className="font-medium text-ink text-sm">No availability blocks yet</p>
          <p className="text-xs text-ink-soft max-w-xs">
            Add your first block above. Each block auto-generates individual booking slots in the next 4 weeks.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((b) => (
            <motion.div
              key={b.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className={cn(
                'flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all',
                b.active
                  ? 'bg-paper border-line/60 shadow-soft'
                  : 'bg-line/20 border-line/40 opacity-60',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-tint text-forest">
                  <Clock className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">
                    {b.is_recurring
                      ? DAYS[b.day_of_week ?? 0]
                      : b.specific_date
                        ? new Date(b.specific_date).toLocaleDateString('en-IN', {
                            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                          })
                        : 'One-off'
                    }
                    {' '}
                    <span className="font-normal text-ink-soft">
                      · {b.start_time.slice(0, 5)} – {b.end_time.slice(0, 5)} IST
                    </span>
                  </p>
                  <p className="text-[11px] text-ink-soft/60 mt-0.5">
                    {b.is_recurring ? 'Weekly recurring' : 'One-off'} · {b.active ? 'Active' : 'Paused'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(b)}
                  title={b.active ? 'Pause block' : 'Resume block'}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-forest hover:text-forest transition-all"
                >
                  {b.active ? 'Pause' : 'Resume'}
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDelete(b.id)}
                  disabled={deletingId === b.id}
                  className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                >
                  {deletingId === b.id ? <Spinner className="h-3 w-3" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { me, signOut, refreshMe } = useAuth()

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [profile, setProfile] = useState<TherapistProfile | null>(null)
  const [verification, setVerification] =
    useState<TherapistVerification | null>(null)
  const [invitations, setInvitations] = useState<HandoffInvitation[]>([])

  // Loading states
  const [loading, setLoading] = useState(true)
  const [invsLoading, setInvsLoading] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    try {
      const res = await api.uploadProfilePhoto(file)
      await refreshMe()
      showToast(res.message || 'Profile photo uploaded and pending moderation.')
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to upload profile photo.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Edit profile form state
  const [bio, setBio] = useState('')
  const [priceInr, setPriceInr] = useState('')
  const [sessionModes, setSessionModes] = useState<
    Array<'video' | 'audio' | 'chat'>
  >([])
  const [specializations, setSpecializations] = useState<string[]>([])
  const [newSpec, setNewSpec] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [newLang, setNewLang] = useState('')

  // Toast notification
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Fetch initial profile & verification details
  useEffect(() => {
    let active = true
    async function loadData() {
      setLoading(true)
      try {
        const [profData, verData] = await Promise.all([
          api.getTherapistProfile(),
          api.getTherapistVerification(),
        ])
        if (!active) return
        setProfile(profData)
        setVerification(verData)

        // Initialize form states
        setBio(profData.bio || '')
        setPriceInr(String(profData.price_inr || ''))
        setSessionModes(profData.session_modes || [])
        setSpecializations(profData.specializations || [])
        setLanguages(profData.languages || [])

        // If verified, fetch invitations
        if (profData.verification_status === 'verified') {
          setInvsLoading(true)
          const invsData = await api.getHandoffInvitations()
          if (active) setInvitations(invsData)
        }
      } catch (err) {
        console.error('Failed to load therapist dashboard data:', err)
      } finally {
        if (active) setLoading(false)
        if (active) setInvsLoading(false)
      }
    }
    loadData()
    return () => {
      active = false
    }
  }, [])

  // Poll invitations periodically if verified
  useEffect(() => {
    if (!profile || profile.verification_status !== 'verified') return

    const interval = setInterval(async () => {
      try {
        const invsData = await api.getHandoffInvitations()
        setInvitations(invsData)
      } catch (err) {
        console.error('Failed to poll invitations:', err)
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [profile])

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  // Edit profile submit
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const updated = await api.updateTherapistProfile({
        bio: bio.trim(),
        price_inr: Number.parseInt(priceInr, 10),
        session_modes: sessionModes,
        specializations,
        languages,
      })
      setProfile(updated)
      showToast('Profile updated successfully.')
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to update profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  // Respond to matching invitations
  const handleInvitationResponse = async (
    invId: string,
    action: 'accept' | 'decline',
  ) => {
    setActionLoadingId(invId)
    try {
      if (action === 'accept') {
        await api.acceptInvitation(invId)
        showToast('Match request accepted.')
      } else {
        await api.declineInvitation(invId)
        showToast('Match request declined.')
      }
      // Refresh list
      const invsData = await api.getHandoffInvitations()
      setInvitations(invsData)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const toggleMode = (mode: 'video' | 'audio' | 'chat') => {
    setSessionModes((m) =>
      m.includes(mode) ? m.filter((x) => x !== mode) : [...m, mode],
    )
  }

  const addSpecialization = () => {
    const spec = newSpec.trim().toLowerCase()
    if (spec && !specializations.includes(spec)) {
      setSpecializations([...specializations, spec])
      setNewSpec('')
    }
  }

  const removeSpecialization = (spec: string) => {
    setSpecializations(specializations.filter((x) => x !== spec))
  }

  const addLanguage = () => {
    const lang = newLang.trim()
    if (lang && !languages.includes(lang)) {
      setLanguages([...languages, lang])
      setNewLang('')
    }
  }

  const removeLanguage = (lang: string) => {
    setLanguages(languages.filter((x) => x !== lang))
  }

  const isVerified = profile?.verification_status === 'verified'

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-cream">
        <span className="text-sm text-ink-soft animate-pulse">
          Loading your workspace…
        </span>
      </main>
    )
  }

  return (
    <div className="flex h-svh w-full flex-col lg:flex-row bg-cream text-ink font-sans select-none overflow-hidden">

      {/* ── Sidebar — Desktop ───────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 flex-col bg-[#1A1C1A] border-r border-[#2E3130] p-6 justify-between select-none">
        <div className="space-y-8">
          {/* Logo in cream tint for dark sidebar */}
          <div className="opacity-90">
            <Logo />
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon, locked }) => {
              const isDisabled = locked && !isVerified
              const isActive = activeTab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => !isDisabled && setActiveTab(id)}
                  disabled={isDisabled}
                  title={isDisabled ? 'Available after verification' : ''}
                  className={cn(
                    'focus-ring flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer',
                    isActive
                      ? 'bg-cream/10 text-cream border border-cream/10'
                      : 'text-cream/50 hover:bg-cream/8 hover:text-cream/80',
                    isDisabled && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </span>
                  {isDisabled && <Lock className="h-3 w-3" />}
                </button>
              )
            })}
          </nav>
        </div>

        {/* User card at bottom */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-cream/5 border border-cream/8">
            <div className="h-8 w-8 bg-forest-tint text-forest text-xs font-semibold rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              {me?.avatar_pending_url ? (
                <img src={me.avatar_pending_url} alt="Profile (Pending)" className="h-full w-full object-cover opacity-75" />
              ) : me?.avatar_url ? (
                <img src={me.avatar_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                me?.display_name?.charAt(0) || 'T'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-cream/90 truncate leading-tight">
                {me?.display_name || 'Therapist'}
              </p>
              <p className="text-[10px] text-cream/40 mt-0.5 capitalize">
                {profile?.verification_status.replace('_', ' ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-cream/40 hover:text-cream/70 hover:bg-cream/8 transition-all cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </aside>

      {/* ── Header — Mobile ─────────────────────────────────────────────── */}
      <header className="lg:hidden flex h-16 shrink-0 items-center justify-between bg-[#1A1C1A] border-b border-[#2E3130] px-5 py-3 select-none">
        <Logo />
        <div className="flex items-center gap-2">
          <Dropdown
            dark
            value={activeTab}
            onChange={(v) => setActiveTab(v as DashboardTab)}
            options={NAV_ITEMS.map((item): DropdownOption => ({
              value: item.id,
              label: item.label,
              icon: <item.icon className="h-3.5 w-3.5" />,
              locked: item.locked && !isVerified,
            }))}
            className="w-48"
          />
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center justify-center h-9 w-9 rounded-xl text-cream/40 hover:text-cream/70 hover:bg-cream/10 transition-all cursor-pointer"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-6 py-8 scrollbar-thin select-text">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* ══ TAB 1: OVERVIEW ══════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">

              {/* Welcome hero banner with blur blobs */}
              <div className="relative overflow-hidden rounded-3xl bg-cover bg-center bg-no-repeat bg-forest-deep border border-forest-deep/10 px-8 py-10 shadow-soft min-h-[200px] flex items-center"
                style={{ backgroundImage: 'url("/hero_bg.png?v=2")' }}>
                <div className="absolute inset-0 bg-forest-deep/35" aria-hidden="true" />
                <div className="relative z-10 space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-cream/10 border border-cream/20 backdrop-blur-sm px-3.5 py-1.5 text-xs font-medium text-cream/90">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Therapist workspace</span>
                  </div>
                  <h1 className="font-display text-3xl sm:text-4xl font-normal text-cream leading-tight">
                    Welcome back,{' '}
                    <span className="italic">
                      {me?.display_name?.split(' ')[0] || 'there'}
                    </span>
                  </h1>
                  <p className="text-sm text-cream/75 max-w-md leading-relaxed">
                    {isVerified
                      ? "You're verified and bookable. Check your match invitations below."
                      : 'Your credentials are under manual review. We\'ll notify you once verified.'}
                  </p>
                </div>
              </div>

              {/* Status banner */}
              {profile?.verification_status === 'under_review' && (
                <div className="flex gap-4 items-start p-5 rounded-2xl bg-accent-butter/40 border border-[#E6C65C]/25">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-butter text-[#8E7216]">
                    <Clock className="h-5 w-5 animate-pulse" />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-normal text-ink leading-tight">
                      Application in manual review
                    </h3>
                    <p className="text-xs text-ink-soft leading-relaxed mt-1">
                      We manually verify credentials for every therapist to maintain professional standards.
                      We'll be in touch by email or WhatsApp once review is complete.
                    </p>
                  </div>
                </div>
              )}

              {profile?.verification_status === 'verified' && (
                <div className="flex gap-4 items-start p-5 rounded-2xl bg-accent-sage/40 border border-[#7FB59A]/25">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-cream">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-normal text-ink leading-tight">
                      Workspace fully verified
                    </h3>
                    <p className="text-xs text-ink-soft leading-relaxed mt-1">
                      You are currently bookable. Pending seeker invitations matching your specialties will list below.
                    </p>
                  </div>
                </div>
              )}

              {profile?.verification_status === 'rejected' && (
                <div className="flex gap-4 items-start p-5 rounded-2xl bg-[#FBE3D0]/60 border border-[#E8A87C]/25">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-apricot text-[#A3633B]">
                    <AlertCircle className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-normal text-ink leading-tight">
                      Verification adjustments required
                    </h3>
                    <p className="text-xs text-ink-soft leading-relaxed mt-1">
                      Our credentials team reviewed your request:
                    </p>
                    <div className="p-3 rounded-xl border border-line bg-paper/60 text-xs text-ink-soft mt-2 leading-relaxed">
                      <strong>Notes:</strong>{' '}
                      {verification?.decision_notes || 'Please resubmit matching credentials.'}
                    </div>
                  </div>
                </div>
              )}

              {profile?.verification_status === 'suspended' && (
                <div className="flex gap-4 items-start p-5 rounded-2xl bg-[#F8DEE4]/50 border border-[#E1A7B5]/25">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-blush text-[#B23A3A]">
                    <XCircle className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-normal text-ink leading-tight">
                      Account suspended
                    </h3>
                    <p className="text-xs text-ink-soft leading-relaxed mt-1">
                      Your practitioner profile has been temporarily suspended. Please contact the administrator team immediately.
                    </p>
                  </div>
                </div>
              )}

              {/* Bento stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={Calendar}
                  iconBg="bg-accent-lavender"
                  iconColor="text-[#6B4FAD]"
                  label="Sessions this month"
                  value="—"
                />
                <StatCard
                  icon={DollarSign}
                  iconBg="bg-accent-sage"
                  iconColor="text-forest"
                  label="Total earnings"
                  value="—"
                />
                <StatCard
                  icon={User}
                  iconBg="bg-accent-sky"
                  iconColor="text-[#1D5E7A]"
                  label="Active seekers"
                  value="—"
                />
                <StatCard
                  icon={Shield}
                  iconBg="bg-accent-apricot"
                  iconColor="text-[#A3633B]"
                  label="Invitations pending"
                  value={String(invitations.filter((i) => i.status === 'pending').length)}
                />
              </div>

              {/* Match Invitations */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl font-normal text-ink">
                    Match invitations
                  </h2>
                  {isVerified && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] bg-forest/10 text-forest font-semibold rounded-full px-2.5 py-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                </div>

                {!isVerified ? (
                  <div className="p-8 border border-dashed border-line rounded-2xl text-center space-y-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-line/60 mx-auto">
                      <Lock className="h-5 w-5 text-ink-soft/50" />
                    </div>
                    <h4 className="text-sm font-medium text-ink">Match requests locked</h4>
                    <p className="text-xs text-ink-soft max-w-sm mx-auto leading-relaxed">
                      Once our clinical review team verifies your credentials, matching seeker invitations
                      (carrying non-identifying request cards only) will appear here.
                    </p>
                  </div>
                ) : invsLoading ? (
                  <p className="text-xs text-ink-soft text-center py-6">Checking for match requests…</p>
                ) : invitations.length === 0 ? (
                  <div className="p-8 border border-dashed border-line rounded-2xl text-center space-y-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-tint mx-auto">
                      <Shield className="h-5 w-5 text-forest/50" />
                    </div>
                    <p className="text-xs text-ink-soft">No pending invitations at this moment.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-5 bg-paper border border-line/60 rounded-2xl space-y-4 shadow-soft hover:shadow-lift transition-shadow"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] font-semibold text-forest uppercase tracking-wider">
                              New match invitation
                            </span>
                            <h4 className="text-sm font-medium text-ink mt-0.5">
                              Request #{inv.id.substring(0, 8)}
                            </h4>
                          </div>
                          <span className="text-xs text-forest bg-forest-tint border border-forest/15 px-2.5 py-0.5 rounded-full font-medium">
                            Score band
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs border-y border-line/30 py-3 text-ink-soft">
                          <div>
                            <strong className="text-ink text-[10px] uppercase tracking-wider">Required specialties</strong>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {inv.specializations?.map((spec: string) => (
                                <span
                                  key={spec}
                                  className="bg-accent-sage border border-[#7FB59A]/20 text-forest px-2 py-0.5 rounded-full text-[10px] font-medium"
                                >
                                  {spec}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <strong className="text-ink text-[10px] uppercase tracking-wider">Preferences</strong>
                            <p className="text-[11px]">Language: {inv.language || 'English'}</p>
                            <p className="text-[11px]">Gender: {inv.gender_preference || 'No preference'}</p>
                            <p className="text-[11px]">
                              Price cap:{' '}
                              {inv.price_ceiling_inr ? `₹${inv.price_ceiling_inr}` : 'No cap'}
                            </p>
                          </div>
                        </div>

                        {inv.need_description && (
                          <div className="p-3.5 bg-cream/50 border border-line/50 rounded-xl">
                            <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider mb-1">
                              Seeker need
                            </p>
                            <p className="text-xs text-ink-soft leading-relaxed italic">
                              "{inv.need_description}"
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => handleInvitationResponse(inv.id, 'decline')}
                            disabled={actionLoadingId !== null}
                            className="focus-ring rounded-full px-4 py-2 border border-line bg-paper text-xs font-medium text-ink-soft hover:bg-cream transition-all cursor-pointer disabled:opacity-50"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInvitationResponse(inv.id, 'accept')}
                            disabled={actionLoadingId !== null}
                            className="focus-ring inline-flex items-center gap-2 rounded-full px-5 py-2 bg-ink text-cream text-xs font-medium hover:bg-forest-deep transition-all cursor-pointer shadow disabled:opacity-50"
                          >
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cream/15">
                              <ArrowRight className="h-3 w-3" />
                            </span>
                            {actionLoadingId === inv.id ? 'Processing…' : 'Accept invitation'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ TAB 2: EDIT PROFILE ══════════════════════════════════════ */}
          {activeTab === 'profile' && (
            <div className="space-y-6">

              {/* Profile header card — Dream Design */}
              <div className="relative overflow-hidden rounded-3xl bg-paper border border-line/60 shadow-soft">
                {/* Gradient banner */}
                <div className="h-28 bg-gradient-to-br from-forest via-forest-deep to-[#0E2D19] relative overflow-hidden">
                  <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-accent-sage opacity-30 blur-3xl" />
                  <div aria-hidden="true" className="pointer-events-none absolute left-1/3 top-0 h-24 w-24 rounded-full bg-accent-butter opacity-20 blur-2xl" />
                </div>

                {/* Avatar — overlaps banner */}
                <div className="px-6 pb-6">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-10">
                    <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-input')?.click()} title="Click to upload profile photo">
                      <div className="h-20 w-20 bg-[#f5e3da] text-forest font-sans font-semibold text-2xl rounded-full border-4 border-paper flex items-center justify-center overflow-hidden shadow-soft relative">
                        {uploadingPhoto ? (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                            <span className="h-4 w-4 border-2 border-cream border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : null}
                        {me?.avatar_pending_url ? (
                          <img src={me.avatar_pending_url} alt="Profile (Pending)" className="h-full w-full object-cover opacity-75" />
                        ) : me?.avatar_url ? (
                          <img src={me.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          <span>{me?.display_name?.charAt(0) || 'T'}</span>
                        )}
                        
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                          <span className="text-[10px] text-cream font-medium tracking-wide uppercase">Upload</span>
                        </div>
                      </div>
                      
                      {/* Hidden File Input */}
                      <input
                        id="avatar-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                      />

                      {/* Verification/Photo status badge */}
                      {me?.avatar_photo_status === 'pending' ? (
                        <div className="absolute -bottom-1 -right-1 h-6 w-6 bg-accent-butter border-2 border-paper rounded-full flex items-center justify-center shadow" title="Photo pending moderation">
                          <Clock className="h-3 w-3 text-[#8E7216]" />
                        </div>
                      ) : (
                        <div className="absolute -bottom-1 -right-1 h-6 w-6 bg-[#F8DEE4] border-2 border-paper rounded-full flex items-center justify-center shadow">
                          <Shield className="h-3 w-3 text-[#B23A3A]" />
                        </div>
                      )}
                    </div>

                    {/* License pill */}
                    {verification?.registration_body && verification.registration_body !== 'None' ? (
                      <div className="inline-flex items-center gap-2 bg-[#a4bd87]/15 border border-[#a4bd87]/25 text-[#495b39] px-3.5 py-1.5 rounded-full text-xs font-medium">
                        <Shield className="h-3 w-3" />
                        {verification.registration_body}
                        <span className="bg-[#495b39]/10 px-1.5 py-0.5 rounded-full text-[10px] uppercase">Registered</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 bg-accent-blush/30 border border-[#E1A7B5]/25 text-[#B23A3A] px-3.5 py-1.5 rounded-full text-xs font-medium">
                        No registration body
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-ink leading-tight">
                        {me?.display_name || 'Therapist'}
                      </h2>
                      {me?.avatar_photo_status === 'pending' && (
                        <span className="inline-flex items-center gap-1 bg-accent-butter/25 border border-accent-butter/30 text-[#8E7216] px-2 py-0.5 rounded-full text-[9px] font-medium animate-pulse">
                          Photo pending approval
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-soft uppercase tracking-wider font-medium">
                      <span>
                        <span className="text-ink-soft/50 mr-1">Gender</span>
                        <span className="text-ink capitalize">{profile?.gender || 'N/A'}</span>
                      </span>
                      <span className="text-ink-soft/30">•</span>
                      <span>
                        <span className="text-ink-soft/50 mr-1">Experience</span>
                        <span className="text-ink">{profile?.years_experience ? `${profile.years_experience} yrs` : 'N/A'}</span>
                      </span>
                      <span className="text-ink-soft/30">•</span>
                      <span>
                        <span className="text-ink-soft/50 mr-1">Setting</span>
                        <span className="text-ink capitalize">{profile?.practice_setting || 'N/A'}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editable profile form */}
              <div className="p-6 bg-paper border border-line/60 rounded-2xl space-y-5 shadow-soft">
                <h3 className="font-display text-xl font-normal text-ink flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-tint text-forest">
                    <Edit className="h-4 w-4" />
                  </span>
                  Public display profile
                </h3>
                <form onSubmit={handleSaveProfile} className="space-y-5">

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-ink-soft/70 uppercase tracking-widest">
                      Public biography
                    </label>
                    <textarea
                      rows={4}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Share your approach, modalities, and guidance methods…"
                      className="w-full resize-none border border-line/65 rounded-xl outline-none text-sm text-ink p-4 focus:border-forest/50 focus:ring-1 focus:ring-forest/10 transition-all placeholder:text-ink-soft/40 bg-cream/20"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-ink-soft/70 uppercase tracking-widest">
                        Fee per session (INR)
                      </label>
                      <input
                        type="number"
                        value={priceInr}
                        onChange={(e) => setPriceInr(e.target.value)}
                        placeholder="e.g. 1500"
                        className="w-full border border-line/65 rounded-xl outline-none text-sm text-ink px-4 py-2.5 focus:border-forest/50 focus:ring-1 focus:ring-forest/10 transition-all placeholder:text-ink-soft/40 bg-cream/20"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-ink-soft/70 uppercase tracking-widest">
                        Session modes
                      </label>
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {(['video', 'audio', 'chat'] as const).map((m) => {
                          const isSel = sessionModes.includes(m)
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => toggleMode(m)}
                              className={cn(
                                'focus-ring px-4 py-1.5 rounded-full border text-xs font-medium transition-all capitalize cursor-pointer',
                                isSel
                                  ? 'border-forest bg-forest text-cream'
                                  : 'border-line bg-paper text-ink-soft hover:bg-forest-tint hover:text-forest',
                              )}
                            >
                              {m}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Specializations */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold text-ink-soft/70 uppercase tracking-widest">
                      Specializations
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {specializations.map((spec) => (
                        <span
                          key={spec}
                          className="inline-flex items-center gap-1.5 bg-accent-sage border border-[#7FB59A]/20 text-forest px-3 py-1 rounded-full text-xs font-medium capitalize"
                        >
                          {spec}
                          <button
                            type="button"
                            onClick={() => removeSpecialization(spec)}
                            className="text-forest/60 hover:text-forest-deep transition-colors"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="relative flex items-center max-w-md">
                      <input
                        type="text"
                        value={newSpec}
                        onChange={(e) => setNewSpec(e.target.value)}
                        placeholder="Add specialization…"
                        className="w-full border border-line/65 rounded-xl outline-none text-xs text-ink pl-3 pr-14 py-2.5 focus:border-forest/50 focus:ring-1 focus:ring-forest/10 transition-all bg-cream/20 placeholder:text-ink-soft/40"
                        onKeyDown={(e) =>
                          e.key === 'Enter' && (e.preventDefault(), addSpecialization())
                        }
                      />
                      <button
                        type="button"
                        onClick={addSpecialization}
                        className="absolute right-2 px-2.5 py-1 bg-forest/10 hover:bg-forest/20 text-forest text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Languages */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold text-ink-soft/70 uppercase tracking-widest">
                      Languages
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {languages.map((lang) => (
                        <span
                          key={lang}
                          className="inline-flex items-center gap-1.5 bg-accent-lavender border border-[#B7A6E0]/20 text-[#6B4FAD] px-3 py-1 rounded-full text-xs font-medium capitalize"
                        >
                          {lang}
                          <button
                            type="button"
                            onClick={() => removeLanguage(lang)}
                            className="text-[#6B4FAD]/60 hover:text-[#4F368A] transition-colors"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="relative flex items-center max-w-md">
                      <input
                        type="text"
                        value={newLang}
                        onChange={(e) => setNewLang(e.target.value)}
                        placeholder="Add language…"
                        className="w-full border border-line/65 rounded-xl outline-none text-xs text-ink pl-3 pr-14 py-2.5 focus:border-forest/50 focus:ring-1 focus:ring-forest/10 transition-all bg-cream/20 placeholder:text-ink-soft/40"
                        onKeyDown={(e) =>
                          e.key === 'Enter' && (e.preventDefault(), addLanguage())
                        }
                      />
                      <button
                        type="button"
                        onClick={addLanguage}
                        className="absolute right-2 px-2.5 py-1 bg-forest/10 hover:bg-forest/20 text-forest text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={savingProfile || bio.trim().length < 10 || !priceInr}
                      className="rounded-full bg-ink px-7 py-2.5 text-sm font-medium text-cream shadow transition-all hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {savingProfile ? 'Saving…' : 'Save profile'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Submitted credentials (view-only) */}
              <div className="p-6 bg-paper border border-line/60 rounded-2xl space-y-4 shadow-soft">
                <h3 className="font-display text-xl font-normal text-ink flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-lavender text-[#6B4FAD]">
                    <FileText className="h-4 w-4" />
                  </span>
                  Submitted credentials
                  <span className="text-xs text-ink-soft/50 font-sans font-normal ml-1">(view-only)</span>
                </h3>
                <div className="divide-y divide-line/35 rounded-2xl border border-line/60 bg-cream/20 overflow-hidden">
                  {[
                    { icon: Shield, iconBg: 'bg-accent-sage', iconColor: 'text-forest', label: 'Professional body', value: verification?.registration_body || 'N/A' },
                    { icon: FileText, iconBg: 'bg-accent-lavender', iconColor: 'text-[#6B4FAD]', label: 'Highest qualification', value: verification?.qualification || 'N/A' },
                    { icon: Sparkles, iconBg: 'bg-accent-apricot', iconColor: 'text-[#A3633B]', label: 'Institution', value: verification?.institution || 'N/A' },
                    { icon: Calendar, iconBg: 'bg-accent-butter', iconColor: 'text-[#8E7216]', label: 'Graduation year', value: String(verification?.qualification_year || 'N/A') },
                    { icon: User, iconBg: 'bg-accent-sky', iconColor: 'text-[#1D5E7A]', label: 'Registration status', value: (profile?.verification_status || '').replace('_', ' ') },
                  ].map(({ icon: Icon, iconBg, iconColor, label, value }) => (
                    <div key={label} className="flex items-center gap-3.5 px-4 py-3.5">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconBg, iconColor)}>
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <span className="text-[10px] text-ink-soft/60 uppercase tracking-widest font-medium block">{label}</span>
                        <span className="text-sm text-ink font-normal capitalize">{value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ TAB 3: AVAILABILITY ══════════════════════════════════════ */}
          {activeTab === 'availability' && (
            isVerified ? (
              <AvailabilityTab showToast={showToast} />
            ) : (
              <LockedTab
                icon={Clock}
                title="Practitioner availability"
                description="Configure your weekly booking slots, buffer blocks, and sync directly with Google Calendar. This feature will be available once you are verified."
                accent="bg-accent-butter/30 border-[#E6C65C]/20"
              />
            )
          )}

          {/* ══ TAB 4: CALENDAR ══════════════════════════════════════════ */}
          {activeTab === 'calendar' && (
            <LockedTab
              icon={Calendar}
              title="Sessions calendar"
              description="View your confirmed bookings, launch LiveKit video rooms, and maintain envelope-encrypted session notes. Coming soon."
              accent="bg-accent-lavender/40 border-[#B7A6E0]/20"
            />
          )}

          {/* ══ TAB 5: EARNINGS ══════════════════════════════════════════ */}
          {activeTab === 'earnings' && <EarningsTab />}

        </div>
      </main>

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 10, x: '-50%' }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ink text-cream px-5 py-2.5 text-xs font-medium shadow-xl border border-cream/10"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const MODALITY_ICON: Record<string, React.ElementType> = {
  video: Video,
  audio: Headphones,
  chat: MessageSquare,
}

function EarningsTab() {
  const [earnings, setEarnings] = useState<{
    total_earned_paise: number
    pending_payout_paise: number
    paid_payout_paise: number
    sessions: Array<{
      booking_id: string
      starts_at: string
      modality: string
      session_price_paise: number
      therapist_gross_paise: number
      payout_status: string
      payout_reference: string | null
    }>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getTherapistEarnings()
      .then(setEarnings)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to fetch earnings details.')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-6 w-6 text-forest" />
      </div>
    )
  }

  if (error || !earnings) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        <p>{error || 'An error occurred while loading earnings.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="font-display text-3xl font-normal text-ink">Earnings & payouts</h2>
        <p className="text-sm text-ink-soft">Track session earnings and pending external payouts. (Times in IST)</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Earned Card */}
        <div className="rounded-2xl border border-forest/15 bg-forest-tint/30 p-5 space-y-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-forest/80">Total Gross Earned</span>
          <p className="text-3xl font-bold text-forest">₹{(earnings.total_earned_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>

        {/* Pending Payout Card */}
        <div className="rounded-2xl border border-[#E6C65C]/20 bg-accent-butter/20 p-5 space-y-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8E7216]">Pending Payouts</span>
          <p className="text-3xl font-bold text-ink">₹{(earnings.pending_payout_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>

        {/* Paid Payout Card */}
        <div className="rounded-2xl border border-line bg-paper p-5 space-y-2 shadow-soft">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-soft">Settled Payouts</span>
          <p className="text-3xl font-bold text-ink-soft">₹{(earnings.paid_payout_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Session Log */}
      <div className="rounded-2xl border border-line bg-paper overflow-hidden shadow-soft">
        <div className="px-5 py-4 border-b border-line bg-cream/10">
          <h3 className="text-sm font-semibold text-ink">Session Log</h3>
        </div>

        {earnings.sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-soft">
            No completed sessions found with earnings records.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line text-[10px] font-semibold text-ink-soft uppercase tracking-wider bg-cream/5">
                  <th className="px-5 py-3">Session Date & Time</th>
                  <th className="px-5 py-3">Modality</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-right">Your Gross</th>
                  <th className="px-5 py-3 text-center">Payout Status</th>
                  <th className="px-5 py-3">Ref ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs text-ink">
                {earnings.sessions.map((s, idx) => {
                  const Icon = MODALITY_ICON[s.modality] ?? Video
                  return (
                    <tr key={s.booking_id || idx} className="hover:bg-cream/5">
                      <td className="px-5 py-3.5 font-medium">
                        {new Intl.DateTimeFormat('en-IN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                          timeZone: 'Asia/Kolkata',
                        }).format(new Date(s.starts_at))}
                      </td>
                      <td className="px-5 py-3.5 capitalize flex items-center gap-1.5 mt-0.5">
                        <Icon className="h-3.5 w-3.5 text-ink-soft" />
                        {s.modality}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink-soft">
                        ₹{(s.session_price_paise / 100).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-forest">
                        ₹{(s.therapist_gross_paise / 100).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize',
                            s.payout_status === 'paid' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            s.payout_status === 'pending' && 'bg-yellow-50 text-yellow-700 border-yellow-200',
                            s.payout_status === 'processing' && 'bg-blue-50 text-blue-700 border-blue-200',
                            s.payout_status === 'failed' && 'bg-red-50 text-red-700 border-red-200',
                            s.payout_status === 'on_hold' && 'bg-amber-50 text-amber-700 border-amber-200',
                          )}
                        >
                          {s.payout_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[10px] text-ink-soft max-w-[120px] truncate">
                        {s.payout_reference || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
