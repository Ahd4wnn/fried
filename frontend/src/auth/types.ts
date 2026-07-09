export type Role = 'seeker' | 'therapist' | 'admin'
export type AssignableRole = 'seeker' | 'therapist'

export interface MeConsents {
  ai_memory_consent: boolean | null
  intake_sharing: boolean | null
  notifications: boolean | null
}

/** Shape returned by GET /api/v1/me. Mirrors backend MeResponse. */
export interface Me {
  id: string
  email: string | null
  role: Role
  display_name: string | null
  avatar_url: string | null
  avatar_pending_url: string | null
  avatar_photo_status: 'none' | 'pending' | 'approved' | 'rejected'
  locale: string
  country: string | null
  status: string
  onboarding_completed: boolean
  /** True once the user has deliberately chosen a role (detail row exists). */
  role_set: boolean
  consents: MeConsents
}
