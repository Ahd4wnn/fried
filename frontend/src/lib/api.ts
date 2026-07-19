import { supabase } from './supabase'
import { env } from './env'
import type { AssignableRole, Me } from '../auth/types'
import type { OnboardingPayload, OnboardingResult } from './onboarding'

const BASE = `${env.VITE_API_BASE_URL.replace(/\/$/, '')}/api/v1`

/** Error shaped like the backend contract: { error: { code, message, details } }. */
export class ApiError extends Error {
  code: string
  status: number
  details: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    status: number,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Attach the Supabase JWT (default true). */
  auth?: boolean
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (auth) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      'We couldn’t reach the server. Check your connection and try again.',
      'network_error',
      0,
    )
  }

  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    const err = (
      payload as {
        error?: {
          code?: string
          message?: string
          details?: Record<string, unknown>
        }
      } | null
    )?.error
    throw new ApiError(
      err?.message ?? 'Something went wrong. Please try again.',
      err?.code ?? 'error',
      res.status,
      err?.details ?? {},
    )
  }

  return payload as T
}

export interface DbHelpline {
  name: string
  numbers: string[]
  hours: string
}

export interface HelplinesResponse {
  verified: boolean
  region: string
  helplines: DbHelpline[]
  note?: string
}

export interface AISession {
  id: string
  status: 'active' | 'ended' | 'closed_crisis'
  title: string | null
  started_at: string
  ended_at: string | null
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  safety_verdict: string | null
  created_at: string
}

export interface AISessionDetail {
  id: string
  status: 'active' | 'ended' | 'closed_crisis'
  title: string | null
  started_at: string
  ended_at: string | null
  messages: AIMessage[]
}

export interface TherapistProfile {
  id: string
  bio: string | null
  specializations: string[]
  languages: string[]
  gender: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say' | null
  price_inr: number | null
  professional_title: string | null
  years_experience: number | null
  session_modes: Array<'video' | 'audio' | 'chat'>
  practice_setting: string | null
  verification_status:
    | 'pending'
    | 'under_review'
    | 'verified'
    | 'rejected'
    | 'suspended'
  bookable: boolean
  onboarding_completed: boolean
}

export interface TherapistProfileUpdate {
  bio?: string
  specializations?: string[]
  languages?: string[]
  session_modes?: Array<'video' | 'audio' | 'chat'>
  price_inr?: number
}

export interface TherapistOnboardingPayload {
  legal_name: string
  whatsapp_number: string
  professional_title: string
  registration_body: string
  registration_number: string | null
  qualification: string
  institution: string
  qualification_year: number
  years_experience: '<2' | '2–5' | '5–10' | '10+'
  specializations: string[]
  languages: string[]
  gender: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say'
  session_modes: Array<'video' | 'audio' | 'chat'>
  price_inr: number
  practice_setting: string
  bio: string
  documents: Array<{ doc_type: string; storage_path: string }>
  declarations: {
    credentials_genuine: boolean
    agree_terms_conduct: boolean
    consent_data_processing: boolean
    confirm_human_professional: boolean
  }
}

export interface TherapistVerification {
  status: 'pending' | 'under_review' | 'verified' | 'rejected' | 'suspended'
  registration_body?: string
  qualification?: string
  institution?: string
  qualification_year?: number
  submitted_at?: string
  decision_notes?: string
}

export interface HandoffInvitation {
  id: string
  escalation_id: string
  status: string
  specializations: string[]
  language: string | null
  gender_preference: string | null
  price_ceiling_inr: number | null
  need_description: string | null
  invited_at: string
  responded_at: string | null
  expires_at: string | null
}

/**
 * Seeker-side shape of GET /handoff/invitations (the endpoint is
 * role-polymorphic: therapists get HandoffInvitation instead).
 */
export interface SeekerInvitation {
  id: string
  status: string
  therapist_id: string
  display_name: string | null
  bio: string | null
  specializations: string[]
  languages: string[]
  gender: string | null
  price_inr: number | null
  invited_at: string
  responded_at: string | null
}

export interface ReportSubmitPayload {
  session_id?: string
  message_id?: string
  category: string
  description?: string
}

export interface ReportItem {
  id: string
  session_id?: string
  message_id?: string
  category: string
  description?: string
  created_at: string
}

export interface AdminKPIs {
  pending_verifications: number
  open_reports: number
  crisis_events_today: number
  active_users: number
  active_therapists: number
}

export interface AdminVerificationRequest {
  id: string
  therapist_id: string
  status: string
  qualification: string | null
  institution: string | null
  qualification_year: number | null
  registration_body: string | null
  submitted_at: string | null
  created_at: string
  therapist_profile: {
    display_name: string | null
    avatar_url: string | null
    professional_title: string | null
    years_experience: number | null
    specializations: string[]
    languages: string[]
    bio: string | null
    gender: string | null
    price_inr: number | null
    practice_setting: string | null
  }
}

export interface DecryptedVerificationResponse {
  legal_name: string
  registration_number: string | null
  documents: Array<{
    id: string
    doc_type: string
    signed_url: string
  }>
}

export interface AdminReportItem {
  id: string
  reporter_id: string
  session_id: string | null
  message_id: string | null
  category: string
  status: string
  created_at: string
}

export interface DecryptedReportResponse {
  reporter_description: string | null
  reported_message: {
    role: string
    text: string
    created_at: string
  } | null
}

export interface AdminUserItem {
  id: string
  role: string
  display_name: string | null
  avatar_url: string | null
  locale: string
  status: string
  country: string | null
  created_at: string
}

export interface CountryDemandItem {
  country: string
  count: number
}

export interface CrisisEventAggregate {
  day: string
  category: string
  severity: string
  trigger_layer: string
  source: string
  event_count: number
}

export const api = {
  getMe: () => request<Me>('/me'),
  setRole: (role: AssignableRole) =>
    request<Me>('/me/role', { method: 'POST', body: { role } }),
  updateMe: (
    patch: Partial<
      Pick<Me, 'display_name' | 'avatar_url' | 'locale' | 'country'>
    >,
  ) => request<Me>('/me', { method: 'PATCH', body: patch }),
  submitOnboarding: (payload: OnboardingPayload) =>
    request<OnboardingResult>('/onboarding', { method: 'POST', body: payload }),
  getHelplines: () =>
    request<HelplinesResponse>('/safety/helplines', { auth: false }),
  submitReport: (body: ReportSubmitPayload) =>
    request<{ status: string }>('/ai/reports', { method: 'POST', body }),
  getReports: () => request<ReportItem[]>('/ai/reports'),
  startAISession: (title?: string) =>
    request<AISession>('/ai/sessions', { method: 'POST', body: { title } }),
  getAISessions: () => request<AISession[]>('/ai/sessions'),
  getAISession: (id: string) => request<AISessionDetail>(`/ai/sessions/${id}`),
  endAISession: (id: string) =>
    request<AISession>(`/ai/sessions/${id}/end`, { method: 'POST' }),
  confirmEscalation: (sessionId: string) =>
    request<{ escalation_id: string; status: string }>(
      `/handoff/escalations/${sessionId}/confirm`,
      { method: 'POST' },
    ),
  consentSummary: (escalationId: string, seekerNote?: string) =>
    request<{ status: string }>(`/handoff/summaries/${escalationId}/consent`, {
      method: 'POST',
      body: { seeker_note: seekerNote },
    }),
  getHandoffInvitations: <T = HandoffInvitation>() =>
    request<T[]>('/handoff/invitations'),
  acceptInvitation: (id: string) =>
    request<{ status: string }>(`/handoff/invitations/${id}/accept`, {
      method: 'POST',
    }),
  declineInvitation: (id: string) =>
    request<{ status: string }>(`/handoff/invitations/${id}/decline`, {
      method: 'POST',
    }),
  selectTherapist: (invitationId: string) =>
    request<{ status: string }>(`/handoff/invitations/${invitationId}/select`, {
      method: 'POST',
    }),
  getSharedSummary: (escalationId: string) =>
    request<{ escalation_id: string; seeker_id: string; summary: string }>(
      `/handoff/summaries/${escalationId}`,
    ),
  submitTherapistOnboarding: (body: TherapistOnboardingPayload) =>
    request<{ status: string; message: string }>('/therapist/onboarding', {
      method: 'POST',
      body,
    }),
  getTherapistVerification: () =>
    request<TherapistVerification>('/therapist/verification'),
  getTherapistProfile: () => request<TherapistProfile>('/therapist/profile'),
  updateTherapistProfile: (body: TherapistProfileUpdate) =>
    request<TherapistProfile>('/therapist/profile', { method: 'PATCH', body }),
  uploadProfilePhoto: async (
    file: File,
  ): Promise<{ status: string; message: string }> => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    const formData = new FormData()
    formData.append('file', file)

    let res: Response
    try {
      res = await fetch(`${BASE}/media/profile-photo`, {
        method: 'POST',
        headers,
        body: formData,
      })
    } catch {
      throw new ApiError(
        'We couldn’t reach the server. Check your connection and try again.',
        'network_error',
        0,
      )
    }

    const payload = await res.json().catch(() => null)

    if (!res.ok) {
      const err = (
        payload as {
          error?: {
            code?: string
            message?: string
            details?: Record<string, unknown>
          }
        } | null
      )?.error
      throw new ApiError(
        err?.message ?? 'Something went wrong. Please try again.',
        err?.code ?? 'error',
        res.status,
        err?.details ?? {},
      )
    }

    return payload as { status: string; message: string }
  },
  getAdminKPIs: () => request<AdminKPIs>('/admin/kpis'),
  getAdminVerifications: () =>
    request<AdminVerificationRequest[]>('/admin/verifications'),
  decryptVerification: (id: string, reason?: string) =>
    request<DecryptedVerificationResponse>(`/admin/verifications/${id}/decrypt`, {
      method: 'POST',
      body: { reason },
    }),
  submitVerificationDecision: (
    id: string,
    action: 'verify' | 'reject' | 'request_info',
    decision_notes: string,
  ) =>
    request<{ status: string }>(`/admin/verifications/${id}/decision`, {
      method: 'POST',
      body: { action, decision_notes },
    }),
  getAdminReports: () => request<AdminReportItem[]>('/admin/reports'),
  decryptReport: (id: string, reason?: string) =>
    request<DecryptedReportResponse>(`/admin/reports/${id}/decrypt`, {
      method: 'POST',
      body: { reason },
    }),
  resolveReport: (id: string, admin_notes: string) =>
    request<{ status: string }>(`/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: { admin_notes },
    }),
  dismissReport: (id: string, admin_notes: string) =>
    request<{ status: string }>(`/admin/reports/${id}/dismiss`, {
      method: 'POST',
      body: { admin_notes },
    }),
  getAdminUsers: (query?: string) =>
    request<AdminUserItem[]>(
      `/admin/users${query ? `?query=${encodeURIComponent(query)}` : ''}`,
    ),
  updateUserStatus: (
    id: string,
    action: 'suspend' | 'reinstate',
    reason?: string,
  ) =>
    request<{ status: string }>(`/admin/users/${id}/status`, {
      method: 'POST',
      body: { action, reason },
    }),
  getCountryDemand: () => request<CountryDemandItem[]>('/admin/country-demand'),
  getCrisisEvents: () => request<CrisisEventAggregate[]>('/admin/crisis-events'),

  // ─── Scheduling ─────────────────────────────────────────────────────────────
  getAvailabilityBlocks: () =>
    request<AvailabilityBlock[]>('/therapist/availability'),
  createAvailabilityBlock: (body: AvailabilityBlockCreate) =>
    request<AvailabilityBlock>('/therapist/availability', {
      method: 'POST',
      body,
    }),
  updateAvailabilityBlock: (id: string, body: Partial<AvailabilityBlockCreate>) =>
    request<AvailabilityBlock>(`/therapist/availability/${id}`, {
      method: 'PATCH',
      body,
    }),
  deleteAvailabilityBlock: (id: string) =>
    request<{ status: string }>(`/therapist/availability/${id}`, {
      method: 'DELETE',
    }),
  listTherapists: (filters?: TherapistFilters) => {
    const params = new URLSearchParams()
    if (filters?.specialization) params.set('specialization', filters.specialization)
    if (filters?.language) params.set('language', filters.language)
    if (filters?.price_max !== undefined) params.set('price_max', String(filters.price_max))
    if (filters?.gender) params.set('gender', filters.gender)
    if (filters?.modality) params.set('modality', filters.modality)
    if (filters?.has_availability_soon) params.set('has_availability_soon', 'true')
    const qs = params.toString()
    return request<TherapistListItem[]>(`/therapists${qs ? `?${qs}` : ''}`)
  },
  getTherapistSlots: (therapistId: string) =>
    request<Slot[]>(`/therapists/${therapistId}/slots`),
  createBooking: (body: BookingCreate) =>
    request<Booking>('/bookings', { method: 'POST', body }),
  getMyBookings: () => request<Booking[]>('/bookings'),
  cancelBooking: (id: string, reason?: string) =>
    request<{ status: string }>(`/bookings/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),

  // ─── Payments ───────────────────────────────────────────────────────────────
  createPaymentOrder: (bookingId: string) =>
    request<{
      id: string
      booking_id: string
      seeker_id: string
      therapist_id: string
      razorpay_order_id: string
      amount_paise: number
      currency: string
      status: string
      created_at: string
    }>('/payments/orders', { method: 'POST', body: { booking_id: bookingId } }),
  verifyPayment: (payload: {
    razorpay_order_id: string
    razorpay_payment_id: string
    razorpay_signature: string
  }) => request<{ status: string; message: string }>('/payments/verify', {
    method: 'POST',
    body: payload,
  }),
  getTherapistEarnings: () =>
    request<{
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
    }>('/therapist/earnings'),
  getAdminPayments: () => request<AdminPaymentsData>('/admin/payments'),
  adminRefundPayment: (paymentId: string, amountPaise?: number) =>
    request<{ status: string; message: string }>(`/admin/payments/${paymentId}/refund`, {
      method: 'POST',
      body: amountPaise !== undefined ? { amount_paise: amountPaise } : {},
    }),
}

// ─── Payments types (admin metadata views — no card data / PII) ───────────────

export type PaymentStatus =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'on_hold'

export interface AdminOrder {
  id: string
  booking_id: string
  seeker_id: string
  therapist_id: string
  razorpay_order_id: string | null
  amount_paise: number
  currency: string
  status: PaymentStatus
  created_at: string
}

export interface AdminPayment {
  id: string
  order_id: string
  booking_id: string
  razorpay_payment_id: string | null
  status: PaymentStatus
  amount_paise: number
  commission_paise: number
  therapist_gross_paise: number
  gateway_fee_paise: number | null
  method: string | null
  refunded_paise: number
  captured_at: string | null
  created_at: string
}

export interface AdminPayout {
  id: string
  therapist_id: string
  payment_id: string | null
  amount_paise: number
  status: PayoutStatus
  reference: string | null
  notes: string | null
  created_at: string
}

export interface AdminPaymentsData {
  orders: AdminOrder[]
  payments: AdminPayment[]
  payouts: AdminPayout[]
}

// ─── Scheduling types ──────────────────────────────────────────────────────────

export interface AvailabilityBlock {
  id: string
  therapist_id: string
  is_recurring: boolean
  day_of_week: number | null
  specific_date: string | null
  start_time: string
  end_time: string
  timezone: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface AvailabilityBlockCreate {
  is_recurring: boolean
  day_of_week?: number | null
  specific_date?: string | null
  start_time: string
  end_time: string
  timezone: string
  active?: boolean
}

export interface Slot {
  id: string
  therapist_id: string
  block_id: string | null
  starts_at: string
  ends_at: string
  status: 'open' | 'held' | 'booked' | 'cancelled'
}

export interface TherapistListItem {
  id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  specializations: string[]
  languages: string[]
  gender: string | null
  price_inr: number | null
  professional_title: string | null
  years_experience: number | null
  session_modes: string[]
  practice_setting: string | null
}

export interface TherapistFilters {
  specialization?: string
  language?: string
  price_max?: number
  gender?: string
  modality?: string
  has_availability_soon?: boolean
}

export interface BookingCreate {
  therapist_id: string
  starts_at: string
  modality: string
  escalation_id?: string
}

export interface Booking {
  id: string
  seeker_id: string
  therapist_id: string
  slot_id: string
  escalation_id: string | null
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  modality: string
  starts_at: string
  ends_at: string
  price_inr: number
  cancelled_by: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  therapist_name?: string | null
  seeker_name?: string | null
}
