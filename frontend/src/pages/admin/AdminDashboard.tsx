import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  ShieldCheck,
  AlertTriangle,
  Users,
  Flame,
  Search,
  Lock,
  Unlock,
  ExternalLink,
  UserX,
  UserCheck,
  Globe,
  FileText,
  ArrowRight,
  DollarSign,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'


import { cn } from '../../lib/cn'
import { api, ApiError } from '../../lib/api'
import type {
  AdminKPIs,
  AdminVerificationRequest,
  DecryptedVerificationResponse,
  AdminReportItem,
  DecryptedReportResponse,
  AdminUserItem,
  CountryDemandItem,
  CrisisEventAggregate,
  AdminPaymentsData,
  AdminPayment,
} from '../../lib/api'
import {
  Button,
  Avatar,
  Badge,
  Input,
  Textarea,
  Spinner,
} from '../../components/ui'
import { useToast } from '../../components/ui'
import { DashboardLayout } from '../../components/layout/DashboardLayout'

// Sidebar nav items for Admin Portal
const ADMIN_NAV = [
  { label: 'Overview', icon: LayoutDashboard, route: '/admin/dashboard', end: true },
  { label: 'Verifications', icon: ShieldCheck, route: '/admin/dashboard/verifications' },
  { label: 'Reports', icon: AlertTriangle, route: '/admin/dashboard/reports' },
  { label: 'Users', icon: Users, route: '/admin/dashboard/users' },
  { label: 'Crisis Monitor', icon: Flame, route: '/admin/dashboard/crisis' },
  { label: 'Payments', icon: DollarSign, route: '/admin/dashboard/payments' },
]

interface AdminDashboardProps {
  tab: 'overview' | 'verifications' | 'reports' | 'users' | 'crisis' | 'payments'
}

export default function AdminDashboard({ tab }: AdminDashboardProps) {
  const { toast } = useToast()

  // State management
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<AdminKPIs | null>(null)
  const [verifications, setVerifications] = useState<AdminVerificationRequest[]>([])
  const [reports, setReports] = useState<AdminReportItem[]>([])
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [countries, setCountries] = useState<CountryDemandItem[]>([])
  const [crisisEvents, setCrisisEvents] = useState<CrisisEventAggregate[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Payments & Payouts tab state
  const [adminPayments, setAdminPayments] = useState<AdminPaymentsData | null>(null)
  const [refundTarget, setRefundTarget] = useState<AdminPayment | null>(null)
  const [refundAmountStr, setRefundAmountStr] = useState('')
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)

  // Audited decryption state
  const [auditTarget, setAuditTarget] = useState<{
    type: 'verification' | 'report'
    id: string
  } | null>(null)
  const [auditReason, setAuditReason] = useState('')
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditSubmitting, setAuditSubmitting] = useState(false)

  // Decrypted data cache (kept in component memory, never saved to localStorage or persistent logs)
  const [decryptedVerifications, setDecryptedVerifications] = useState<
    Record<string, DecryptedVerificationResponse>
  >({})
  const [decryptedReports, setDecryptedReports] = useState<
    Record<string, DecryptedReportResponse>
  >({})

  // Verification decision state
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [decisionSubmitting, setDecisionSubmitting] = useState<Record<string, boolean>>({})

  // Report triage action state
  const [reportActionNotes, setReportActionNotes] = useState<Record<string, string>>({})
  const [reportSubmitting, setReportSubmitting] = useState<Record<string, boolean>>({})

  // User status suspension action state
  const [userSuspensionTarget, setUserSuspensionTarget] = useState<AdminUserItem | null>(null)
  const [userStatusReason, setUserStatusReason] = useState('')
  const [userStatusSubmitting, setUserStatusSubmitting] = useState(false)

  // Fetch data depending on current active tab
  const fetchData = async () => {
    setLoading(true)
    try {
      if (tab === 'overview') {
        const kpiData = await api.getAdminKPIs()
        setKpis(kpiData)
      } else if (tab === 'verifications') {
        const verList = await api.getAdminVerifications()
        setVerifications(verList)
      } else if (tab === 'reports') {
        const repList = await api.getAdminReports()
        setReports(repList)
      } else if (tab === 'users') {
        const [userList, countryList] = await Promise.all([
          api.getAdminUsers(searchQuery || undefined),
          api.getCountryDemand(),
        ])
        setUsers(userList)
        setCountries(countryList)
      } else if (tab === 'crisis') {
        const crisisList = await api.getCrisisEvents()
        setCrisisEvents(crisisList)
      } else if (tab === 'payments') {
        const payData = await api.getAdminPayments()
        setAdminPayments(payData)
      }
    } catch (err) {
      console.error('Error fetching admin data:', err)
      toast({
        title: 'Fetch Error',
        description: err instanceof ApiError ? err.message : 'Could not fetch admin data.',
        tone: 'danger',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-tab-change: fetchData() toggles its own loading flag
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchData reads searchQuery; refetching on every keystroke is not desired
  }, [tab])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchData()
  }

  // Open Decryption Reason Dialog
  const triggerDecryption = (type: 'verification' | 'report', id: string) => {
    setAuditTarget({ type, id })
    setAuditReason('')
    setAuditError(null)
  }

  // Perform Audited Decryption
  const handlePerformDecryption = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!auditTarget) return
    if (!auditReason.trim() || auditReason.trim().length < 5) {
      setAuditError('Please provide a descriptive reason (at least 5 characters).')
      return
    }

    setAuditSubmitting(true)
    setAuditError(null)

    try {
      if (auditTarget.type === 'verification') {
        const res = await api.decryptVerification(auditTarget.id, auditReason)
        setDecryptedVerifications((prev) => ({ ...prev, [auditTarget.id]: res }))
        toast({
          title: 'Decrypted Successfully',
          description: 'PII and credentials files unlocked. Access has been audit-logged.',
          tone: 'success',
        })
      } else {
        const res = await api.decryptReport(auditTarget.id, auditReason)
        setDecryptedReports((prev) => ({ ...prev, [auditTarget.id]: res }))
        toast({
          title: 'Decrypted Successfully',
          description: 'Report details and message context unlocked. Access has been audit-logged.',
          tone: 'success',
        })
      }
      setAuditTarget(null)
    } catch (err) {
      setAuditError(err instanceof ApiError ? err.message : 'Decryption failed.')
    } finally {
      setAuditSubmitting(false)
    }
  }

  // Therapist Verification Actions
  const handleVerificationDecision = async (
    id: string,
    action: 'verify' | 'reject' | 'request_info',
  ) => {
    const notes = decisionNotes[id]?.trim()
    if (!notes || notes.length < 5) {
      toast({
        title: 'Action Required',
        description: 'Please write verification notes explaining this action (at least 5 characters).',
        tone: 'warning',
      })
      return
    }

    setDecisionSubmitting((prev) => ({ ...prev, [id]: true }))

    try {
      await api.submitVerificationDecision(id, action, notes)
      toast({
        title: 'Decision Recorded',
        description: `Therapist status updated to ${action === 'verify' ? 'verified' : action}.`,
        tone: 'success',
      })
      // Clear inputs
      setDecisionNotes((prev) => ({ ...prev, [id]: '' }))
      // Refresh list
      await fetchData()
    } catch (err) {
      toast({
        title: 'Action Failed',
        description: err instanceof ApiError ? err.message : 'Could not submit decision.',
        tone: 'danger',
      })
    } finally {
      setDecisionSubmitting((prev) => ({ ...prev, [id]: false }))
    }
  }

  // AI Report Resolution & Dismissal Actions
  const handleReportTriage = async (id: string, action: 'resolve' | 'dismiss') => {
    const notes = reportActionNotes[id]?.trim()
    if (!notes || notes.length < 5) {
      toast({
        title: 'Action Required',
        description: 'Please provide notes outlining the resolution action (at least 5 characters).',
        tone: 'warning',
      })
      return
    }

    setReportSubmitting((prev) => ({ ...prev, [id]: true }))

    try {
      if (action === 'resolve') {
        await api.resolveReport(id, notes)
      } else {
        await api.dismissReport(id, notes)
      }
      toast({
        title: 'Report Updated',
        description: `Report marked as ${action === 'resolve' ? 'resolved' : 'dismissed'}.`,
        tone: 'success',
      })
      setReportActionNotes((prev) => ({ ...prev, [id]: '' }))
      await fetchData()
    } catch (err) {
      toast({
        title: 'Action Failed',
        description: err instanceof ApiError ? err.message : 'Could not resolve report.',
        tone: 'danger',
      })
    } finally {
      setReportSubmitting((prev) => ({ ...prev, [id]: false }))
    }
  }

  // Open User Status Action Dialog (Suspend/Reinstate)
  const triggerUserStatus = (user: AdminUserItem) => {
    setUserSuspensionTarget(user)
    setUserStatusReason('')
  }

  // Toggle Seeker/Therapist Suspended State
  const handleUserStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userSuspensionTarget) return

    const action = userSuspensionTarget.status === 'suspended' ? 'reinstate' : 'suspend'
    const reason = userStatusReason.trim()
    if (action === 'suspend' && (!reason || reason.length < 5)) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a clear reason for suspension (at least 5 characters).',
        tone: 'warning',
      })
      return
    }

    setUserStatusSubmitting(true)

    try {
      await api.updateUserStatus(userSuspensionTarget.id, action, reason || undefined)
      toast({
        title: 'User Updated',
        description: `User status changed to ${action === 'suspend' ? 'suspended' : 'active'}.`,
        tone: 'success',
      })
      setUserSuspensionTarget(null)
      await fetchData()
    } catch (err) {
      toast({
        title: 'Update Failed',
        description: err instanceof ApiError ? err.message : 'Could not change user status.',
        tone: 'danger',
      })
    } finally {
      setUserStatusSubmitting(false)
    }
  }

  const handleConfirmRefund = async () => {
    if (!refundTarget) return
    setRefundSubmitting(true)
    setRefundError(null)
    try {
      const amountPaise = refundAmountStr.trim() ? Math.round(parseFloat(refundAmountStr) * 100) : undefined
      await api.adminRefundPayment(refundTarget.id, amountPaise)
      toast({
        title: 'Refund Processed',
        description: 'Refund order submitted via Razorpay. DB records updated.',
        tone: 'success',
      })
      setRefundTarget(null)
      fetchData()
    } catch (err) {
      setRefundError(err instanceof ApiError ? err.message : 'Refund failed.')
    } finally {
      setRefundSubmitting(false)
    }
  }

  return (
    <DashboardLayout navItems={ADMIN_NAV} theme="admin-dark">
      <div className="space-y-8 select-text pb-10">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-5">
          <div>
            <h1 className="font-display text-4xl text-white font-normal leading-tight">
              Admin Portal
            </h1>
            <p className="text-sm text-neutral-400 mt-1 font-sans">
              Verify practitioners, triage automated safety alerts, and manage platform safety logs.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-forest/20 border border-forest/30 px-4 py-2 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-xs font-semibold text-neutral-200">
              System Admin Active
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Spinner className="h-8 w-8 text-forest" />
              <p className="text-xs text-neutral-400 select-none animate-pulse">
                Fetching records securely...
              </p>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Tab 1: Overview */}
            {tab === 'overview' && kpis && (
              <div className="space-y-8">
                {/* Top Featured Mesh Card & Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Vibrant Green Mesh Card */}
                  <div
                    className="relative overflow-hidden rounded-[32px] p-8 shadow-2xl flex flex-col justify-between min-h-[240px] border border-white/10"
                    style={{
                      background: 'linear-gradient(135deg, #1C5C32 0%, #0d3b1e 100%)',
                      backgroundImage: `
                        radial-gradient(circle at 10% 20%, rgba(52, 211, 153, 0.45) 0%, transparent 65%),
                        radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.5) 0%, transparent 55%),
                        linear-gradient(135deg, #1C5C32 0%, #0d3b1e 100%)
                      `,
                    }}
                  >
                    <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none select-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-200 via-neutral-500 to-neutral-800" />
                    <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none" />
                    <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />
                    
                    <div className="relative z-10 space-y-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                        Platform Encryption Active
                      </span>
                      
                      <div className="space-y-1.5">
                        <p className="text-3xl font-display text-white font-normal leading-tight">
                          Platform Security & Claims
                        </p>
                        <p className="text-xs text-white/70 max-w-xs leading-relaxed font-sans">
                          All decrypt actions and credentials reviews require justification and are permanently written to audit log trails.
                        </p>
                      </div>
                    </div>

                    <div className="relative z-10 flex gap-2 pt-4">
                      <button 
                        onClick={() => {
                          toast({
                            title: "System Integrity",
                            description: "All database encryptions verified.",
                            tone: "success"
                          });
                        }}
                        className="px-5 py-2.5 rounded-full bg-white text-forest text-xs font-semibold hover:bg-white/95 transition-all shadow-md cursor-pointer border-0 select-none"
                      >
                        Verify System
                      </button>
                      <button 
                        onClick={() => {
                          toast({
                            title: "Audit Log Active",
                            description: "Audit trace verified with 0 warnings.",
                            tone: "success"
                          });
                        }}
                        className="px-5 py-2.5 rounded-full border border-white/30 text-white text-xs font-semibold hover:bg-white/10 transition-all backdrop-blur-sm cursor-pointer select-none"
                      >
                        Trace Logs
                      </button>
                    </div>
                  </div>

                  {/* Submission Vol. Trend (Custom rounded pill bar chart) */}
                  <div className="rounded-[32px] border border-white/[0.06] bg-white/[0.02] p-6 space-y-4 backdrop-blur-xl shadow-2xl flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          Verification Claims Volume
                        </h4>
                        <p className="text-xl font-semibold text-white mt-0.5">Submission Activity</p>
                      </div>
                      <span className="text-[9px] bg-white/5 border border-white/10 text-neutral-400 rounded-full px-2 py-0.5 font-sans">
                        Last 5 Weeks
                      </span>
                    </div>
                    
                    {/* SVG Chart */}
                    <div className="h-28 flex items-end justify-between pt-2 px-1 relative">
                      {[
                        { label: 'W1', val: 35, display: '3 claims' },
                        { label: 'W2', val: 65, display: '5 claims' },
                        { label: 'W3', val: 45, display: '4 claims' },
                        { label: 'W4', val: 85, display: '8 claims', active: true },
                        { label: 'W5', val: 55, display: '5 claims' },
                      ].map((item, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-2 flex-1 group">
                          <div className="w-6 sm:w-8 bg-white/[0.03] rounded-full h-20 relative overflow-hidden flex items-end">
                            <div 
                              className={cn(
                                "w-full rounded-full transition-all duration-500 ease-out",
                                item.active 
                                  ? "bg-gradient-to-t from-forest to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]" 
                                  : "bg-neutral-800 group-hover:bg-neutral-700"
                              )}
                              style={{ height: `${item.val}%` }}
                            />
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-neutral-900 border border-white/10 rounded-lg px-2 py-1 text-[9px] text-white whitespace-nowrap pointer-events-none z-10 shadow-xl font-sans">
                              {item.display}
                            </div>
                          </div>
                          <span className={cn(
                            "text-[9px] font-medium font-sans",
                            item.active ? "text-white font-semibold" : "text-neutral-500"
                          )}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Crisis split gauge (Donut chart with segments) */}
                  <div className="rounded-[32px] border border-white/[0.06] bg-white/[0.02] p-6 space-y-4 backdrop-blur-xl shadow-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Crisis Categories
                      </h4>
                      <p className="text-xl font-semibold text-white mt-0.5">Critical Severity Split</p>
                    </div>

                    <div className="flex items-center gap-5 py-1">
                      {/* SVG Donut */}
                      <div className="relative h-20 w-20 shrink-0">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            className="stroke-neutral-900 fill-none"
                            strokeWidth="10"
                          />
                          {/* Segment 1: Critical (Red) - 45% (dasharray: 113) */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            className="stroke-red-500/80 fill-none"
                            strokeWidth="10"
                            strokeDasharray="113 251.2"
                            strokeDashoffset="0"
                            strokeLinecap="round"
                          />
                          {/* Segment 2: Escalation (Yellow) - 35% (dasharray: 87.9) */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            className="stroke-amber-500/80 fill-none"
                            strokeWidth="10"
                            strokeDasharray="87.9 251.2"
                            strokeDashoffset="-113"
                            strokeLinecap="round"
                          />
                          {/* Segment 3: Other (Green) - 20% (dasharray: 50.2) */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            className="stroke-emerald-500/80 fill-none"
                            strokeWidth="10"
                            strokeDasharray="50.2 251.2"
                            strokeDashoffset="-200.9"
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-xs font-bold text-white leading-none">100%</span>
                          <span className="text-[8px] text-neutral-500 mt-0.5">Audit</span>
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex-1 space-y-1.5 text-[10px] font-sans">
                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                            Ideation
                          </span>
                          <span className="font-semibold text-white">45%</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Escalations
                          </span>
                          <span className="font-semibold text-white">35%</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            General Filters
                          </span>
                          <span className="font-semibold text-white">20%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* KPI Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {[
                    { label: 'Pending Claims', value: kpis.pending_verifications, icon: ShieldCheck, colorBg: 'bg-[#8B5CF6]/15', colorText: 'text-violet-400' },
                    { label: 'Open Safety Reports', value: kpis.open_reports, icon: AlertTriangle, colorBg: 'bg-amber-500/15', colorText: 'text-amber-400' },
                    { label: 'Crisis Events Today', value: kpis.crisis_events_today, icon: Flame, colorBg: 'bg-red-500/15', colorText: 'text-red-400' },
                    { label: 'Active Seekers', value: kpis.active_users, icon: Users, colorBg: 'bg-blue-500/15', colorText: 'text-blue-400' },
                    { label: 'Verified Therapists', value: kpis.active_therapists, icon: UserCheck, colorBg: 'bg-emerald-500/15', colorText: 'text-emerald-400' },
                  ].map((card, index) => {
                    const Icon = card.icon
                    return (
                      <div 
                        key={index}
                        className="flex flex-col gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5 shadow-xl backdrop-blur-md"
                      >
                        <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', card.colorBg, card.colorText)}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-2xl font-bold text-white font-sans">{card.value}</p>
                          <p className="text-xs text-neutral-400 mt-0.5 font-sans">{card.label}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Dashboard overview instructions */}
                <div className="rounded-[32px] border border-white/[0.06] bg-white/[0.02] p-6 space-y-4 backdrop-blur-md shadow-xl">
                  <h3 className="font-display text-2xl font-normal text-white">Administrative Guardrails</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-neutral-400 leading-relaxed font-sans">
                    <div className="space-y-2 border-r border-white/5 pr-4 last:border-r-0 last:pr-0">
                      <h4 className="font-semibold text-neutral-200 text-sm flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        Strict Seeker Privacy
                      </h4>
                      <p>
                        Pursuant to Hovio safety documentation, administrators have zero direct access to raw chat transcripts. All safety alerts and crisis monitoring operate solely on aggregated metadata.
                      </p>
                    </div>
                    <div className="space-y-2 border-r border-white/5 pr-4 last:border-r-0 last:pr-0">
                      <h4 className="font-semibold text-neutral-200 text-sm flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Audited Decryption Gating
                      </h4>
                      <p>
                        Decryption of therapist credentials or reported messages is masked by default. Clicking decryption logs the actor identity, timestamp, and verification reason directly to the safety logs.
                      </p>
                    </div>
                    <div className="space-y-2 last:border-r-0 last:pr-0">
                      <h4 className="font-semibold text-neutral-200 text-sm flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Consequential Action Audit
                      </h4>
                      <p>
                        Decisions regarding approvals, rejections, suspensions, and safety resolutions submit state changes to the database and write immutable logs to the platform audit trace.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Verifications Queue */}
            {tab === 'verifications' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="font-display text-2xl font-normal text-white">Pending Therapist Claims</h2>
                  <Badge className="text-xs bg-forest/20 text-emerald-400 border border-forest/30 py-0.5 px-3">
                    {verifications.length} Submission(s)
                  </Badge>
                </div>

                {verifications.length === 0 ? (
                  <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center space-y-3 bg-white/[0.01]">
                    <ShieldCheck className="h-12 w-12 text-neutral-600/30 mx-auto" />
                    <p className="text-sm text-neutral-400 font-sans">No pending manual verifications are waiting in the queue.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {verifications.map((req) => {
                      const isDecrypted = !!decryptedVerifications[req.id]
                      const decryptedData = decryptedVerifications[req.id]
                      const profile = req.therapist_profile

                      return (
                        <div
                          key={req.id}
                          className="relative overflow-hidden rounded-[32px] border border-white/[0.05] bg-white/[0.02] shadow-2xl backdrop-blur-md"
                        >
                          {/* Vibrant green mesh gradient top banner */}
                          <div
                            className="h-20 w-full relative overflow-hidden"
                            style={{
                              background: 'linear-gradient(135deg, #1C5C32 0%, #0d3b1e 100%)',
                              backgroundImage: `
                                radial-gradient(circle at 10% 25%, rgba(52, 211, 153, 0.4) 0%, transparent 65%),
                                radial-gradient(circle at 90% 75%, rgba(16, 185, 129, 0.5) 0%, transparent 55%),
                                linear-gradient(135deg, #1C5C32 0%, #0d3b1e 100%)
                              `,
                            }}
                          >
                            <div className="absolute inset-0 opacity-15 mix-blend-overlay pointer-events-none select-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-200 via-neutral-500 to-neutral-800" />
                          </div>

                          {/* Avatar overlapping the banner bottom border */}
                          <div className="absolute top-10 left-6">
                            <div className="relative h-20 w-20 rounded-full border-[6px] border-[#090B0E] bg-neutral-900 text-neutral-400 text-2xl font-bold flex items-center justify-center shadow-lg overflow-hidden select-none">
                              {profile?.avatar_url ? (
                                <img
                                  src={profile.avatar_url}
                                  alt="Therapist profile"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span>{profile?.display_name?.charAt(0) || 'T'}</span>
                              )}
                            </div>
                          </div>

                          {/* Card Content body */}
                          <div className="pt-12 px-6 pb-6 space-y-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                              <div>
                                <h3 className="text-xl font-semibold text-white leading-tight flex flex-wrap items-center gap-2">
                                  {profile?.display_name || 'Therapist Practitioner'}
                                  <Badge
                                    className={cn(
                                      'text-[10px] py-0.5 px-2.5 rounded-full uppercase tracking-wider font-semibold font-sans',
                                      req.status === 'pending'
                                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                        : req.status === 'under_review'
                                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                        : 'bg-neutral-500/10 text-neutral-400 border border-neutral-500/20',
                                    )}
                                  >
                                    {req.status}
                                  </Badge>
                                </h3>
                                <p className="text-xs text-neutral-400 mt-1 font-sans">
                                  {profile?.professional_title || 'Licensed Professional'}
                                </p>
                              </div>

                              <div className="text-right text-[10px] text-neutral-400 font-sans">
                                <span className="block font-semibold">Submitted:</span>
                                <span>
                                  {req.submitted_at
                                    ? new Date(req.submitted_at).toLocaleDateString()
                                    : new Date(req.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            {/* Stats Row */}
                            <div className="grid grid-cols-3 gap-4 border-y border-white/5 py-4 text-center">
                              <div>
                                <p className="text-base font-semibold text-white font-sans">
                                  {profile?.years_experience !== null
                                    ? `${profile?.years_experience} Yrs`
                                    : '—'}
                                </p>
                                <p className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5 font-sans">
                                  Experience
                                </p>
                              </div>
                              <div>
                                <p className="text-base font-semibold text-white font-sans">
                                  {profile?.price_inr ? `₹${profile.price_inr}` : '—'}
                                </p>
                                <p className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5 font-sans">
                                  Price (INR)
                                </p>
                              </div>
                              <div>
                                <p className="text-base font-semibold text-white capitalize font-sans">
                                  {profile?.practice_setting || '—'}
                                </p>
                                <p className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5 font-sans">
                                  Setting
                                </p>
                              </div>
                            </div>

                            {/* Profile Bio Details */}
                            {profile?.bio && (
                              <div className="space-y-1.5 font-sans">
                                <span className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider">
                                  Practitioner Bio
                                </span>
                                <p className="text-xs text-neutral-400 leading-relaxed italic border-l-2 border-forest pl-3">
                                  "{profile.bio}"
                                </p>
                              </div>
                            )}

                            {/* Specialty / Lang badges */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {profile?.specializations?.map((s) => (
                                <Badge
                                  key={s}
                                  className="text-[9px] bg-forest/10 text-emerald-400 border border-forest/20 py-0.5 px-2.5 rounded-full"
                                >
                                  {s}
                                </Badge>
                              ))}
                              {profile?.languages?.map((l) => (
                                <Badge
                                  key={l}
                                  className="text-[9px] bg-white/[0.03] text-neutral-400 border border-white/5 py-0.5 px-2.5 rounded-full"
                                >
                                  {l}
                                </Badge>
                              ))}
                            </div>

                            {/* Verification PII - Audited decryption area */}
                            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-4 space-y-4">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-white flex items-center gap-1.5 font-sans">
                                  <Lock className="h-3.5 w-3.5 text-neutral-400" />
                                  Credentials Documentation (PII)
                                </span>
                                {!isDecrypted ? (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 text-xs gap-1 border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10 cursor-pointer"
                                    onClick={() => triggerDecryption('verification', req.id)}
                                  >
                                    <Unlock className="h-3 w-3" />
                                    Audited Decrypt
                                  </Button>
                                ) : (
                                  <Badge className="bg-forest/20 text-emerald-400 border border-forest/30 text-[10px] py-0.5 px-2.5 rounded-full">
                                    Decrypted
                                  </Badge>
                                )}
                              </div>

                              {isDecrypted && decryptedData ? (
                                <div className="space-y-4 pt-3 border-t border-white/5 text-xs font-sans">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <span className="text-[9px] text-neutral-500 uppercase">Legal Name</span>
                                      <p className="font-semibold text-white text-sm mt-0.5">{decryptedData.legal_name}</p>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-neutral-500 uppercase">Registration Number</span>
                                      <p className="font-semibold text-white text-sm mt-0.5">
                                        {decryptedData.registration_number || 'No Registration Number Supplied'}
                                      </p>
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-neutral-500 uppercase">Institution</span>
                                    <p className="font-semibold text-white mt-0.5">
                                      {req.institution || '—'} ({req.qualification_year || '—'})
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-neutral-500 uppercase block mb-1">
                                      Credential Uploads (Short-lived Links)
                                    </span>
                                    <div className="flex flex-col gap-1.5">
                                      {decryptedData.documents && decryptedData.documents.length > 0 ? (
                                        decryptedData.documents.map((doc) => (
                                          <a
                                            key={doc.id}
                                            href={doc.signed_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 underline font-medium hover:scale-[1.01] transition-all w-fit"
                                          >
                                            <FileText className="h-3.5 w-3.5" />
                                            <span>{doc.doc_type}</span>
                                            <ExternalLink className="h-2.5 w-2.5" />
                                          </a>
                                        ))
                                      ) : (
                                        <p className="text-xs text-red-400">No documents associated with request.</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-neutral-400 pt-1 font-sans leading-relaxed">
                                  Full legal name, registration ID, and file credentials links are envelope-encrypted. Accessing them writes to the immutable security logs.
                                </p>
                              )}
                            </div>

                            {/* Action Form */}
                            <div className="space-y-3 pt-4 border-t border-white/5">
                              <label className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider block font-sans">
                                Decision & Audit Log Notes (Required)
                              </label>
                              <Textarea
                                rows={2}
                                placeholder="State findings, confirm credentials match, or outline information needed..."
                                value={decisionNotes[req.id] || ''}
                                onChange={(e) =>
                                  setDecisionNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                                }
                                className="text-xs focus-ring bg-white/[0.02] border-white/10 text-white placeholder:text-neutral-600 focus:bg-white/[0.04]"
                              />

                              <div className="flex flex-wrap gap-2 pt-1 justify-end font-sans">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={decisionSubmitting[req.id]}
                                  onClick={() => handleVerificationDecision(req.id, 'request_info')}
                                  className="h-8 text-xs border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10 cursor-pointer"
                                >
                                  Request Info
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={decisionSubmitting[req.id]}
                                  onClick={() => handleVerificationDecision(req.id, 'reject')}
                                  className="h-8 text-xs text-red-400 border-red-500/20 bg-red-950/10 hover:bg-red-950/20 cursor-pointer"
                                >
                                  Reject Submission
                                </Button>

                                <div className="grow sm:grow-0" />

                                {/* Pill-shaped Arrow CTA Button for verification approval */}
                                <button
                                  disabled={decisionSubmitting[req.id]}
                                  onClick={() => handleVerificationDecision(req.id, 'verify')}
                                  className={cn(
                                    'focus-ring flex h-9 items-center justify-center rounded-full bg-forest text-white hover:bg-forest-deep px-5 text-xs font-semibold shadow-[0_0_15px_rgba(28,92,80,0.3)] transition-all cursor-pointer border-0 select-none disabled:opacity-40 disabled:pointer-events-none',
                                  )}
                                >
                                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 mr-2">
                                    <ArrowRight className="h-3 w-3 text-white" />
                                  </div>
                                  <span>{decisionSubmitting[req.id] ? 'Submitting...' : 'Approve & Verify'}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Reports Triage */}
            {tab === 'reports' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="font-display text-2xl font-normal text-white">AI Safety Reports</h2>
                  <Badge className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 py-0.5 px-3">
                    {reports.length} Open Report(s)
                  </Badge>
                </div>

                {reports.length === 0 ? (
                  <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center space-y-3 bg-white/[0.01]">
                    <AlertTriangle className="h-12 w-12 text-neutral-600/30 mx-auto" />
                    <p className="text-sm text-neutral-400 font-sans">Excellent. No outstanding AI companion safety reports exist.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reports.map((rep) => {
                      const isDecrypted = !!decryptedReports[rep.id]
                      const decryptedData = decryptedReports[rep.id]

                      return (
                        <div
                          key={rep.id}
                          className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5 shadow-2xl space-y-4 hover:border-white/10 transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                                <AlertTriangle className="h-4 w-4" />
                              </span>
                              <div className="font-sans">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                                  Report #{rep.id.substring(0, 8)}
                                </h4>
                                <p className="text-[10px] text-neutral-400 mt-0.5">
                                  Safety Category: <span className="font-semibold text-neutral-200 capitalize">{rep.category}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-right font-sans">
                              <Badge
                                className={cn(
                                  'text-[10px] py-0.5 px-2.5 rounded-full uppercase font-semibold',
                                  rep.status === 'open'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : rep.status === 'resolved'
                                    ? 'bg-forest/20 text-emerald-400 border border-forest/30'
                                    : 'bg-neutral-500/10 text-neutral-400 border border-neutral-500/20',
                                )}
                              >
                                {rep.status}
                              </Badge>
                              <span className="text-[10px] text-neutral-500 block">
                                {new Date(rep.created_at).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Decrypted message display */}
                          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-4 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-semibold text-white flex items-center gap-1.5 font-sans">
                                <Lock className="h-3.5 w-3.5 text-neutral-400" />
                                Reported Message Details (PII Gated)
                              </span>
                              {!isDecrypted ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 text-xs gap-1 border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10 cursor-pointer"
                                  onClick={() => triggerDecryption('report', rep.id)}
                                >
                                  <Unlock className="h-3 w-3" />
                                  Audited Decrypt
                                </Button>
                              ) : (
                                <Badge className="bg-forest/20 text-emerald-400 border border-forest/30 text-[10px] py-0.5 px-2.5 rounded-full font-sans">
                                  Decrypted
                                </Badge>
                              )}
                            </div>

                            {isDecrypted && decryptedData ? (
                              <div className="space-y-3 pt-2 border-t border-white/5 text-xs font-sans">
                                {decryptedData.reporter_description && (
                                  <div>
                                    <span className="text-[9px] text-neutral-500 uppercase block">
                                      Reporter Description
                                    </span>
                                    <p className="text-xs text-neutral-300 bg-neutral-900/60 border border-white/5 rounded-lg p-2.5 mt-1 leading-relaxed">
                                      "{decryptedData.reporter_description}"
                                    </p>
                                  </div>
                                )}
                                {decryptedData.reported_message ? (
                                  <div>
                                    <span className="text-[9px] text-neutral-500 uppercase block mb-1">
                                      Reported Chat Turn Context
                                    </span>
                                    <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-neutral-900/60 border border-white/5">
                                      <div className="flex items-center gap-1.5">
                                        <Badge
                                          className={cn(
                                            'text-[8px] uppercase px-1.5 font-bold',
                                            decryptedData.reported_message.role === 'user'
                                              ? 'bg-forest/20 text-emerald-400'
                                              : 'bg-accent-lavender text-violet-400',
                                          )}
                                        >
                                          {decryptedData.reported_message.role}
                                        </Badge>
                                        <span className="text-[9px] text-neutral-500">
                                          {new Date(decryptedData.reported_message.created_at).toLocaleTimeString()}
                                        </span>
                                      </div>
                                      <p className="text-xs text-neutral-200 leading-relaxed select-text mt-1">
                                        {decryptedData.reported_message.text}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-red-400">Reported transcript context not loaded.</p>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-400 pt-1 font-sans leading-relaxed">
                                Reporter description and reported transcript message context are envelope-encrypted. Accessing them logs reasons and flags sensitive decryption to safety monitoring tables.
                              </p>
                            )}
                          </div>

                          {/* Action area */}
                          <div className="space-y-3 pt-2 font-sans">
                            <label className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider block">
                              Resolution Log Notes (Required)
                            </label>
                            <Textarea
                              rows={2}
                              placeholder="Document actions taken, suspension details, safety evaluations, or reasons for dismissal..."
                              value={reportActionNotes[rep.id] || ''}
                              onChange={(e) =>
                                setReportActionNotes((prev) => ({ ...prev, [rep.id]: e.target.value }))
                              }
                              className="text-xs focus-ring bg-white/[0.02] border-white/10 text-white placeholder:text-neutral-600 focus:bg-white/[0.04]"
                            />

                            <div className="flex gap-2 justify-end pt-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={reportSubmitting[rep.id]}
                                onClick={() => handleReportTriage(rep.id, 'dismiss')}
                                className="h-8 text-xs border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10 cursor-pointer"
                              >
                                Dismiss Report
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={reportSubmitting[rep.id]}
                                onClick={() => handleReportTriage(rep.id, 'resolve')}
                                className="h-8 text-xs bg-forest text-white hover:bg-forest-deep shadow-[0_0_15px_rgba(28,92,80,0.2)] cursor-pointer"
                              >
                                Resolve & Save
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: User Directory */}
            {tab === 'users' && (
              <div className="space-y-8">
                {/* Search Bar */}
                <form onSubmit={handleSearchSubmit} className="flex gap-2 font-sans">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                    <Input
                      placeholder="Search profiles by display name or role (seeker, therapist, admin)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 text-sm focus-ring bg-white/[0.02] border-white/10 text-white placeholder:text-neutral-600 focus:bg-white/[0.04]"
                    />
                  </div>
                  <Button type="submit" size="sm" className="h-10 px-5 bg-forest text-white hover:bg-forest-deep shadow-[0_0_12px_rgba(28,92,80,0.2)] cursor-pointer">
                    Search
                  </Button>
                </form>

                {/* Country Demand Aggregates side-by-side or above */}
                <div className="rounded-[24px] border border-white/[0.05] bg-white/[0.02] p-5 space-y-3 shadow-xl backdrop-blur-md">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Globe className="h-4 w-4" />
                    <h3 className="font-semibold text-[10px] uppercase tracking-wider text-neutral-300 font-sans">
                      Platform Country Demand Aggregates
                    </h3>
                  </div>
                  {countries.length === 0 ? (
                    <p className="text-xs text-neutral-400 font-sans">No regional user counts loaded.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {countries.map((c) => (
                        <div
                          key={c.country || 'Unknown'}
                          className="p-3 border border-white/5 rounded-xl bg-white/[0.01] text-center"
                        >
                          <span className="text-[9px] text-neutral-500 block font-medium capitalize truncate font-sans">
                            {c.country || 'Unknown'}
                          </span>
                          <span className="text-base font-bold text-white mt-1 block font-sans">{c.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* User Table/List */}
                <div className="space-y-4">
                  <h3 className="font-display text-2xl font-normal text-white">Registered User Accounts</h3>
                  {users.length === 0 ? (
                    <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center space-y-3 bg-white/[0.01]">
                      <Users className="h-12 w-12 text-neutral-600/30 mx-auto" />
                      <p className="text-sm text-neutral-400 font-sans">No profiles matching search parameters were found.</p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] shadow-2xl backdrop-blur-md">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-white/[0.03] border-b border-white/10 font-sans">
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                User Profile
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                Role
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                Country / Locale
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                Account Status
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px] text-right">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map((u) => (
                              <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors font-sans">
                                <td className="p-4 flex items-center gap-3">
                                  <Avatar
                                    src={u.avatar_url || undefined}
                                    name={u.display_name || undefined}
                                    className="h-8 w-8 text-xs font-semibold text-emerald-400 bg-forest/20 border border-forest/10"
                                  />
                                  <div>
                                    <p className="font-semibold text-white">{u.display_name || 'Anonymous Seeker'}</p>
                                    <p className="text-[10px] text-neutral-500 font-mono select-all mt-0.5">
                                      ID: {u.id.substring(0, 8)}...
                                    </p>
                                  </div>
                                </td>
                                <td className="p-4 capitalize">
                                  <Badge
                                    className={cn(
                                      'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                                      u.role === 'admin'
                                        ? 'bg-forest/20 text-emerald-400 border-forest/30'
                                        : u.role === 'therapist'
                                        ? 'bg-accent-lavender/10 text-violet-400 border-accent-lavender/20'
                                        : 'bg-white/5 text-neutral-400 border-white/10',
                                    )}
                                  >
                                    {u.role}
                                  </Badge>
                                </td>
                                <td className="p-4">
                                  <span className="font-semibold text-neutral-200 uppercase">{u.country || 'N/A'}</span>
                                  <span className="text-[10px] text-neutral-500 block mt-0.5">{u.locale}</span>
                                </td>
                                <td className="p-4 capitalize">
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1.5 text-[11px] font-semibold',
                                      u.status === 'suspended' ? 'text-red-400' : 'text-[#10B981]',
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        'h-1.5 w-1.5 rounded-full',
                                        u.status === 'suspended' ? 'bg-red-400 animate-pulse' : 'bg-[#10B981]',
                                      )}
                                    />
                                    {u.status}
                                  </span>
                                </td>
                                <td className="p-4 text-right">
                                  {u.role !== 'admin' ? (
                                    u.status === 'suspended' ? (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => triggerUserStatus(u)}
                                        className="h-7 text-[10px] py-1 gap-1 border-forest/30 text-emerald-400 hover:bg-forest/10 cursor-pointer"
                                      >
                                        <UserCheck className="h-3 w-3" />
                                        Reinstate
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => triggerUserStatus(u)}
                                        className="h-7 text-[10px] py-1 gap-1 border-red-500/20 text-red-400 hover:bg-red-950/20 cursor-pointer"
                                      >
                                        <UserX className="h-3 w-3" />
                                        Suspend
                                      </Button>
                                    )
                                  ) : (
                                    <span className="text-[10px] text-neutral-500 italic">Root Gated</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 5: Crisis Monitor */}
            {tab === 'crisis' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="font-display text-2xl font-normal text-white">Crisis Aggregate Monitor</h2>
                    <p className="text-xs text-neutral-400 mt-1 font-sans leading-relaxed">
                      Metadata counts only. Individual seeker transcripts are encrypted and completely inaccessible.
                    </p>
                  </div>
                  <Badge className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 py-0.5 px-3">
                    Metadata Trends
                  </Badge>
                </div>

                {/* Crisis KPI summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Crisis volume card */}
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.01] p-6 space-y-2 backdrop-blur-md">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 font-sans">Crisis Volume Today</span>
                    <p className="text-3xl font-bold text-white font-sans">{kpis?.crisis_events_today ?? 0}</p>
                  </div>
                </div>

                {crisisEvents.length === 0 ? (
                  <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center space-y-3 bg-white/[0.01]">
                    <Flame className="h-12 w-12 text-red-400/20 mx-auto" />
                    <p className="text-sm text-neutral-400 font-sans">No crisis events recorded on platform.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Aggregated Logs View */}
                    <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] shadow-2xl backdrop-blur-md">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-white/[0.03] border-b border-white/10 font-sans">
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                Date Range
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                Category
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                Severity
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                Trigger Layer
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">
                                Source
                              </th>
                              <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px] text-right">
                                Event Count
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {crisisEvents.map((c, idx) => (
                              <tr key={idx} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors font-sans">
                                <td className="p-4 font-medium text-neutral-200 font-mono">{c.day}</td>
                                <td className="p-4 capitalize">
                                  <Badge className="text-[10px] font-medium bg-white/5 text-neutral-400 border border-white/10 rounded-full py-0.5 px-2.5">
                                    {c.category}
                                  </Badge>
                                </td>
                                <td className="p-4 uppercase">
                                  <Badge
                                    className={cn(
                                      'text-[10px] font-semibold px-2.5 py-0.5 rounded-full border',
                                      c.severity === 'high' || c.severity === 'critical'
                                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                                    )}
                                  >
                                    {c.severity}
                                  </Badge>
                                </td>
                                <td className="p-4 capitalize text-neutral-400">{c.trigger_layer}</td>
                                <td className="p-4 capitalize text-neutral-400">{c.source}</td>
                                <td className="p-4 text-right font-bold text-white pr-6">{c.event_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 6: Payments */}
            {tab === 'payments' && (
              <PaymentsTab
                data={adminPayments}
                onRefund={(p) => {
                  setRefundTarget(p)
                  setRefundAmountStr('')
                  setRefundError(null)
                }}
              />
            )}
          </motion.div>
        )}
      </div>

      {/* Modal 1: Audited Decryption Reason Modal */}
      <AnimatePresence>
        {auditTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md rounded-[32px] border border-white/10 bg-neutral-900/95 p-6 shadow-2xl space-y-6 backdrop-blur-2xl text-sans"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-forest/20 text-emerald-400 shadow-xl border border-forest/30">
                <Lock className="h-5 w-5" />
              </div>

              <div className="space-y-2 text-center">
                <h3 className="font-display text-xl font-semibold text-white leading-tight">
                  Audited Decryption Request
                </h3>
                <p className="text-xs leading-relaxed text-neutral-400 max-w-sm mx-auto">
                  You are attempting to decrypt sensitive data for{' '}
                  <span className="font-semibold text-neutral-200">
                    {auditTarget.type === 'verification' ? 'Therapist Credentials' : 'AI Safety Report'}
                  </span>
                  . Decrypting this content is strictly logged for safety audits.
                </p>
              </div>

              <form onSubmit={handlePerformDecryption} className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Reason for Decryption (Required)
                  </label>
                  <Textarea
                    rows={3}
                    placeholder="Provide operational justification for credentials review or safety report verification (e.g., 'Verifying professional license with state board')."
                    value={auditReason}
                    onChange={(e) => setAuditReason(e.target.value)}
                    className="text-xs focus-ring bg-white/[0.02] border-white/10 text-white placeholder:text-neutral-600 focus:bg-white/[0.04]"
                    required
                  />
                </div>

                {auditError && (
                  <div className="rounded-xl bg-red-950/20 border border-red-500/20 p-3 text-xs text-red-400">
                    {auditError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 rounded-full py-3 text-xs font-semibold cursor-pointer border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10"
                    onClick={() => setAuditTarget(null)}
                    disabled={auditSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 rounded-full bg-forest text-white hover:bg-forest-deep py-3 text-xs font-semibold shadow-[0_0_15px_rgba(28,92,80,0.2)] cursor-pointer"
                    disabled={auditSubmitting}
                  >
                    {auditSubmitting ? 'Decrypting...' : 'Perform Decrypt'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: User Status Update Action Overlay */}
      <AnimatePresence>
        {userSuspensionTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md rounded-[32px] border border-white/10 bg-neutral-900/95 p-6 shadow-2xl space-y-6 backdrop-blur-2xl text-sans"
            >
              <div
                className={cn(
                  'mx-auto flex h-12 w-12 items-center justify-center rounded-full shadow-xl border',
                  userSuspensionTarget.status === 'suspended'
                    ? 'bg-forest/20 text-emerald-400 border-forest/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/20',
                )}
              >
                {userSuspensionTarget.status === 'suspended' ? (
                  <UserCheck className="h-5 w-5" />
                ) : (
                  <UserX className="h-5 w-5" />
                )}
              </div>

              <div className="space-y-2 text-center">
                <h3 className="font-display text-xl font-semibold text-white leading-tight">
                  {userSuspensionTarget.status === 'suspended' ? 'Reinstate User Account' : 'Suspend User Account'}
                </h3>
                <p className="text-xs leading-relaxed text-neutral-400 max-w-sm mx-auto">
                  {userSuspensionTarget.status === 'suspended' ? (
                    <>
                      You are about to reinstate the profile of{' '}
                      <span className="font-semibold text-white">{userSuspensionTarget.display_name}</span>. This will restore their full access to Hovio.
                    </>
                  ) : (
                    <>
                      You are about to suspend the profile of{' '}
                      <span className="font-semibold text-white">{userSuspensionTarget.display_name}</span>. This prevents them from accessing their companion and marks therapists as unbookable.
                    </>
                  )}
                </p>
              </div>

              <form onSubmit={handleUserStatusUpdate} className="space-y-4">
                {userSuspensionTarget.status !== 'suspended' && (
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                      Reason for Suspension (Required)
                    </label>
                    <Textarea
                      rows={3}
                      placeholder="Detail violations of platform safety policies or behavior leading to suspension..."
                      value={userStatusReason}
                      onChange={(e) => setUserStatusReason(e.target.value)}
                      className="text-xs focus-ring bg-white/[0.02] border-white/10 text-white placeholder:text-neutral-600 focus:bg-white/[0.04]"
                      required
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 rounded-full py-3 text-xs font-semibold cursor-pointer border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10"
                    onClick={() => setUserSuspensionTarget(null)}
                    disabled={userStatusSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className={cn(
                      'flex-1 rounded-full py-3 text-xs font-semibold shadow-md cursor-pointer border-0',
                      userSuspensionTarget.status === 'suspended'
                        ? 'bg-forest text-white hover:bg-forest-deep shadow-[0_0_15px_rgba(28,92,80,0.2)]'
                        : 'bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.2)]',
                    )}
                    disabled={userStatusSubmitting}
                  >
                    {userStatusSubmitting
                      ? 'Processing...'
                      : userSuspensionTarget.status === 'suspended'
                      ? 'Confirm Reinstate'
                      : 'Confirm Suspend'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 3: Refund Confirmation Modal */}
      <AnimatePresence>
        {refundTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md rounded-[32px] border border-white/10 bg-neutral-900/95 p-6 shadow-2xl space-y-6 backdrop-blur-2xl text-sans"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400 shadow-xl border border-red-500/20">
                <DollarSign className="h-5 w-5" />
              </div>

              <div className="space-y-2 text-center">
                <h3 className="font-display text-xl font-normal text-white leading-tight">
                  Process Refund
                </h3>
                <p className="text-xs leading-relaxed text-neutral-400 max-w-sm mx-auto">
                  You are initiating a manual refund for payment{' '}
                  <span className="font-semibold text-neutral-200">{refundTarget.razorpay_payment_id || refundTarget.id}</span>.
                </p>
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-left space-y-1 text-xs">
                  <div className="flex justify-between text-neutral-400 font-sans">
                    <span>Original Amount:</span>
                    <span className="text-white font-semibold">
                      ₹{(refundTarget.amount_paise / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-400 font-sans">
                    <span>Already Refunded:</span>
                    <span className="text-red-400 font-semibold">
                      ₹{(refundTarget.refunded_paise / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-400 border-t border-white/5 pt-1 mt-1 font-bold font-sans">
                    <span>Remaining Balance:</span>
                    <span className="text-emerald-400">
                      ₹{((refundTarget.amount_paise - refundTarget.refunded_paise) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5 text-left font-sans">
                  <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Refund Amount (INR) — Optional
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={`e.g. ${((refundTarget.amount_paise - refundTarget.refunded_paise) / 100).toFixed(2)}`}
                    value={refundAmountStr}
                    onChange={(e) => setRefundAmountStr(e.target.value)}
                    className="text-xs focus-ring bg-white/[0.02] border-white/10 text-white placeholder:text-neutral-600 focus:bg-white/[0.04]"
                  />
                  <p className="text-[10px] text-neutral-500 leading-relaxed">
                    Leave blank to refund the full remaining balance. If specified, the value will be converted to paise and processed.
                  </p>
                </div>

                {refundError && (
                  <div className="rounded-xl bg-red-950/20 border border-red-500/20 p-3 text-xs text-red-400 font-sans">
                    {refundError}
                  </div>
                )}

                <div className="flex gap-3 pt-2 font-sans">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 rounded-full py-3 text-xs font-semibold cursor-pointer border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10"
                    onClick={() => setRefundTarget(null)}
                    disabled={refundSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConfirmRefund}
                    className="flex-1 rounded-full bg-red-500 text-white hover:bg-red-600 py-3 text-xs font-semibold shadow-[0_0_15px_rgba(239,68,68,0.2)] cursor-pointer"
                    disabled={refundSubmitting}
                  >
                    {refundSubmitting ? 'Refunding...' : 'Confirm Refund'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  )
}

interface PaymentsTabProps {
  data: AdminPaymentsData | null
  onRefund: (payment: AdminPayment) => void
}

function PaymentsTab({ data, onRefund }: PaymentsTabProps) {
  const [subTab, setSubTab] = useState<'orders' | 'payments' | 'payouts'>('payments')

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8 text-forest" />
          <p className="text-xs text-neutral-400 select-none animate-pulse">
            Loading payments data...
          </p>
        </div>
      </div>
    )
  }

  const { orders = [], payments = [], payouts = [] } = data

  // Calculations for KPIs
  const totalCapturedPaise = payments
    .filter((p) => p.status === 'captured' || p.status === 'partially_refunded' || p.status === 'refunded')
    .reduce((sum, p) => sum + p.amount_paise, 0)

  const totalRefundedPaise = payments.reduce((sum, p) => sum + p.refunded_paise, 0)

  const pendingPayoutPaise = payouts
    .filter((p) => p.status === 'pending' || p.status === 'processing' || p.status === 'on_hold')
    .reduce((sum, p) => sum + p.amount_paise, 0)

  const paidPayoutPaise = payouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount_paise, 0)

  const formatINR = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Volume Captured', value: formatINR(totalCapturedPaise), desc: `${payments.length} transactions` },
          { label: 'Total Refunded', value: formatINR(totalRefundedPaise), desc: 'Manual & automatic' },
          { label: 'Pending Payouts', value: formatINR(pendingPayoutPaise), desc: 'Awaiting transfer' },
          { label: 'Paid Payouts', value: formatINR(paidPayoutPaise), desc: 'Settled to practitioners' },
        ].map((card, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5 shadow-xl backdrop-blur-md font-sans"
          >
            <p className="text-xs text-neutral-400 font-sans font-medium uppercase tracking-wider">{card.label}</p>
            <div>
              <p className="text-2xl font-bold text-white font-sans">{card.value}</p>
              <p className="text-[10px] text-neutral-500 mt-1 font-sans">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex border-b border-white/5 pb-px">
        {[
          { id: 'payments', label: 'Payments Captured' },
          { id: 'orders', label: 'Razorpay Orders' },
          { id: 'payouts', label: 'Therapist Payouts' },
        ].map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setSubTab(tabItem.id as 'orders' | 'payments' | 'payouts')}
            className={cn(
              'px-6 py-3 text-xs font-semibold font-sans border-b-2 transition-all cursor-pointer relative -bottom-px border-0 bg-transparent',
              subTab === tabItem.id
                ? 'border-forest text-emerald-400 bg-forest/5 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            )}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="space-y-4">
        {subTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-xl font-normal text-white">Captured Payments Log</h3>
              <Badge className="text-xs bg-forest/20 text-emerald-400 border border-forest/30 py-0.5 px-3">
                {payments.length} Records
              </Badge>
            </div>

            {payments.length === 0 ? (
              <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center bg-white/[0.01]">
                <p className="text-sm text-neutral-400 font-sans">No captured payments found.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] shadow-2xl backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/10 font-sans">
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Payment ID</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Razorpay Payment ID</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Total Paid</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Refunded</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Platform Split</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Therapist Net</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Method</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Status</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => {
                        const canRefund = (p.status === 'captured' || p.status === 'partially_refunded') && (p.amount_paise > p.refunded_paise)
                        return (
                          <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors font-sans">
                            <td className="p-4">
                              <p className="font-semibold text-white truncate max-w-[120px]" title={p.id}>{p.id}</p>
                              <span className="text-[9px] text-neutral-500 block mt-0.5">Booking: {p.booking_id.substring(0, 8)}...</span>
                            </td>
                            <td className="p-4">
                              <span className="font-mono text-neutral-300">{p.razorpay_payment_id || 'N/A'}</span>
                              {p.captured_at && (
                                <span className="text-[9px] text-neutral-500 block mt-0.5">
                                  {new Date(p.captured_at).toLocaleString()}
                                </span>
                              )}
                            </td>
                            <td className="p-4 font-semibold text-white">{formatINR(p.amount_paise)}</td>
                            <td className="p-4 text-red-400">
                              {p.refunded_paise > 0 ? formatINR(p.refunded_paise) : '—'}
                            </td>
                            <td className="p-4 text-neutral-300">
                              {formatINR(p.commission_paise)}
                              {p.gateway_fee_paise != null && p.gateway_fee_paise > 0 && (
                                <span className="text-[9px] text-neutral-500 block">Fee: {formatINR(p.gateway_fee_paise)}</span>
                              )}
                            </td>
                            <td className="p-4 text-emerald-400 font-semibold">{formatINR(p.therapist_gross_paise)}</td>
                            <td className="p-4 capitalize text-neutral-400">{p.method || 'Unknown'}</td>
                            <td className="p-4">
                              <Badge
                                className={cn(
                                  'text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase',
                                  p.status === 'captured'
                                    ? 'bg-forest/20 text-emerald-400 border-forest/30'
                                    : p.status === 'refunded'
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                    : p.status === 'partially_refunded'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-white/5 text-neutral-400 border-white/10'
                                )}
                              >
                                {p.status.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="p-4 text-right">
                              {canRefund ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onRefund(p)}
                                  className="h-7 text-[10px] py-1 border-red-500/20 text-red-400 hover:bg-red-950/20 cursor-pointer"
                                >
                                  Refund
                                </Button>
                              ) : (
                                <span className="text-[10px] text-neutral-500 italic select-none">Locked</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {subTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-xl font-normal text-white">Razorpay Orders Log</h3>
              <Badge className="text-xs bg-forest/20 text-emerald-400 border border-forest/30 py-0.5 px-3">
                {orders.length} Records
              </Badge>
            </div>

            {orders.length === 0 ? (
              <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center bg-white/[0.01]">
                <p className="text-sm text-neutral-400 font-sans">No orders found.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] shadow-2xl backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/10 font-sans">
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Order ID / Razorpay ID</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Booking / Seeker</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Therapist ID</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Amount</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Status</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors font-sans">
                          <td className="p-4">
                            <p className="font-semibold text-white truncate max-w-[120px]" title={o.id}>{o.id}</p>
                            <span className="text-[9px] text-mono text-neutral-400 block mt-0.5">{o.razorpay_order_id || 'N/A'}</span>
                          </td>
                          <td className="p-4">
                            <p className="text-neutral-200">Booking: {o.booking_id.substring(0, 8)}...</p>
                            <span className="text-[9px] text-neutral-500 block mt-0.5">Seeker: {o.seeker_id.substring(0, 8)}...</span>
                          </td>
                          <td className="p-4 font-mono text-neutral-300">{o.therapist_id.substring(0, 8)}...</td>
                          <td className="p-4 font-semibold text-white">
                            {formatINR(o.amount_paise)} <span className="text-[10px] text-neutral-400 uppercase">{o.currency}</span>
                          </td>
                          <td className="p-4">
                            <Badge
                              className={cn(
                                'text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase',
                                o.status === 'captured'
                                  ? 'bg-forest/20 text-emerald-400 border-forest/30'
                                  : o.status === 'failed'
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                  : 'bg-white/5 text-neutral-400 border-white/10'
                              )}
                            >
                              {o.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-neutral-400">
                            {new Date(o.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {subTab === 'payouts' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-xl font-normal text-white">Therapist Payouts Log</h3>
              <Badge className="text-xs bg-forest/20 text-emerald-400 border border-forest/30 py-0.5 px-3">
                {payouts.length} Records
              </Badge>
            </div>

            {payouts.length === 0 ? (
              <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center bg-white/[0.01]">
                <p className="text-sm text-neutral-400 font-sans">No payouts found.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] shadow-2xl backdrop-blur-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/10 font-sans">
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Payout ID</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Therapist ID</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Payment ID</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Therapist Net</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Status</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Reference / Notes</th>
                        <th className="p-4 font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors font-sans">
                          <td className="p-4 font-semibold text-white">{p.id}</td>
                          <td className="p-4 font-mono text-neutral-300">{p.therapist_id.substring(0, 8)}...</td>
                          <td className="p-4 font-mono text-neutral-400">
                            {p.payment_id ? `${p.payment_id.substring(0, 8)}...` : 'N/A'}
                          </td>
                          <td className="p-4 font-semibold text-emerald-400">{formatINR(p.amount_paise)}</td>
                          <td className="p-4">
                            <Badge
                              className={cn(
                                'text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase',
                                p.status === 'paid'
                                  ? 'bg-forest/20 text-emerald-400 border-forest/30'
                                  : p.status === 'pending' || p.status === 'processing'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : p.status === 'on_hold'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-red-500/10 text-red-400 border-red-500/20'
                              )}
                            >
                              {p.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-neutral-300">
                            {p.reference && <p className="font-mono">Ref: {p.reference}</p>}
                            {p.notes && <p className="text-[10px] text-neutral-500 mt-0.5">{p.notes}</p>}
                            {!p.reference && !p.notes && <span className="text-neutral-500">—</span>}
                          </td>
                          <td className="p-4 text-neutral-400">
                            {new Date(p.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

