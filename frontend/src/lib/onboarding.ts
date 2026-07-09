// Shared onboarding payload/result types (mirrors backend OnboardingSubmit).

export interface OnboardingAgreement {
  age_confirmed: boolean
  terms: boolean
  privacy: boolean
}

export interface OnboardingConsents {
  data_processing: boolean
  ai_memory: boolean
  notifications_whatsapp: boolean
  notifications_email: boolean
}

export interface OnboardingPayload {
  name: string
  country: string
  age: number
  gender: string
  gender_self_describe?: string | null
  relationship_status: string
  tried_therapy: boolean
  financial_situation: string
  referral_source: string
  referral_other?: string | null
  occupation?: string | null
  concerns: string[]
  concerns_other?: string | null
  support_system: string
  medication: string
  preferred_language: string
  preferred_languages: string[]
  preferred_language_other?: string | null
  therapist_gender_preference: string
  past_therapy_note?: string | null
  therapist_should_know?: string | null
  whatsapp_number?: string | null
  agreement: OnboardingAgreement
  consents: OnboardingConsents
  suitability_none_apply: boolean
}

export interface OnboardingResult {
  onboarding_completed: boolean
  suitability_flagged: boolean
}
