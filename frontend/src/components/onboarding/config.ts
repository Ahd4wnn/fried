import type { OnboardingPayload } from '../../lib/onboarding'

export interface ChipOption {
  value: string
  label: string
}

export type InputSpec =
  | { kind: 'text'; placeholder?: string; optional?: boolean; long?: boolean }
  | { kind: 'number'; placeholder?: string }
  | { kind: 'single'; options: ChipOption[] }
  | { kind: 'multi'; options: ChipOption[]; optional?: boolean }
  | { kind: 'country' }

export interface QuestionStep {
  /** Hovio's message. `{name}` is interpolated from the answer to Q1. */
  assistant: string
  input: InputSpec
}

/** Working shape held in memory during the flow. */
export interface Answers {
  name: string
  country: string
  age: number
  gender: string
  gender_self_describe?: string
  relationship_status: string
  tried_therapy: boolean
  past_therapy_note?: string
  financial_situation: string
  referral_source: string
  referral_other?: string
  occupation?: string
  concerns: string[]
  concerns_other?: string
  support_system: string
  medication: string
  preferred_languages: string[]
  preferred_language_other?: string
  therapist_gender_preference: string
  therapist_should_know?: string
  agreement: { age_confirmed: boolean; terms: boolean; privacy: boolean }
  consents: {
    data_processing: boolean
    ai_memory: boolean
    notifications_whatsapp: boolean
    notifications_email: boolean
  }
  whatsapp_number?: string
}

export const QUESTION_STEPS: Record<string, QuestionStep> = {
  name: {
    assistant:
      'Hi, I’m Hovio. I’m glad you’re here. To start — what should I call you?',
    input: { kind: 'text', placeholder: 'Your name or a nickname' },
  },
  country: {
    assistant:
      'Where are you currently located/based? This helps us display the correct emergency resources.',
    input: { kind: 'country' },
  },
  age: {
    assistant: 'Lovely to meet you, {name}. How old are you?',
    input: { kind: 'number', placeholder: 'Your age' },
  },
  gender: {
    assistant: 'Thank you. What’s your gender?',
    input: {
      kind: 'single',
      options: [
        { value: 'woman', label: 'Woman' },
        { value: 'man', label: 'Man' },
        { value: 'non_binary', label: 'Non-binary' },
        { value: 'prefer_not', label: 'Prefer not to say' },
        { value: 'self_describe', label: 'Self-describe' },
      ],
    },
  },
  gender_self: {
    assistant: 'However you’d like to describe it.',
    input: { kind: 'text', placeholder: 'How you describe your gender' },
  },
  relationship: {
    assistant: 'And your relationship status?',
    input: {
      kind: 'single',
      options: [
        { value: 'single', label: 'Single' },
        { value: 'in_relationship', label: 'In a relationship' },
        { value: 'married', label: 'Married' },
        { value: 'separated_divorced', label: 'Separated or divorced' },
        { value: 'widowed', label: 'Widowed' },
        { value: 'complicated', label: 'It’s complicated' },
        { value: 'prefer_not', label: 'Prefer not to say' },
      ],
    },
  },
  tried_therapy: {
    assistant: 'Have you tried therapy before?',
    input: {
      kind: 'single',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
  },
  past_therapy_note: {
    assistant:
      'Would you like to share a little about it? Only if you want to.',
    input: {
      kind: 'text',
      placeholder: 'Share as much or as little as you like',
      optional: true,
      long: true,
    },
  },
  financial: {
    assistant: 'How would you describe your current financial situation?',
    input: {
      kind: 'single',
      options: [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'managing', label: 'Managing' },
        { value: 'stretched', label: 'Stretched' },
        { value: 'struggling', label: 'Struggling' },
        { value: 'prefer_not', label: 'Prefer not to say' },
      ],
    },
  },
  referral: {
    assistant: 'Where did you hear about us?',
    input: {
      kind: 'single',
      options: [
        { value: 'instagram', label: 'Instagram' },
        { value: 'friend_family', label: 'Friend or family' },
        { value: 'google', label: 'Google search' },
        { value: 'app_store', label: 'App Store' },
        { value: 'other', label: 'Other' },
      ],
    },
  },
  referral_other: {
    assistant: 'No problem — where did you find us?',
    input: { kind: 'text', placeholder: 'Where you heard about us' },
  },
  occupation: {
    assistant: 'What do you do? (Optional.)',
    input: { kind: 'text', placeholder: 'Your occupation', optional: true },
  },
  concerns: {
    assistant:
      'What’s bringing you to Hovio right now? Choose any that fit — there’s no wrong answer.',
    input: {
      kind: 'multi',
      optional: true,
      options: [
        { value: 'stress', label: 'Stress' },
        { value: 'anxiety', label: 'Anxiety' },
        { value: 'low_mood', label: 'Low mood' },
        { value: 'relationships', label: 'Relationships' },
        { value: 'work_study', label: 'Work or study' },
        { value: 'sleep', label: 'Sleep' },
        { value: 'loss_grief', label: 'Loss or grief' },
        { value: 'self_growth', label: 'Self-growth' },
        { value: 'something_else', label: 'Something else' },
      ],
    },
  },
  concerns_other: {
    assistant: 'Tell me a little more, in your own words.',
    input: {
      kind: 'text',
      placeholder: 'What’s on your mind',
      optional: true,
      long: true,
    },
  },
  support: {
    assistant: 'Do you currently have people you can lean on?',
    input: {
      kind: 'single',
      options: [
        { value: 'strong', label: 'Strong support' },
        { value: 'some', label: 'Some' },
        { value: 'not_really', label: 'Not really' },
        { value: 'prefer_not', label: 'Prefer not to say' },
      ],
    },
  },
  medication: {
    assistant:
      'Are you currently taking any medication for your mental health? No judgment — this just helps us support you well.',
    input: {
      kind: 'single',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'prefer_not', label: 'Prefer not to say' },
      ],
    },
  },
  language: {
    assistant: 'Which languages would you prefer for sessions? Select all that apply.',
    input: {
      kind: 'multi',
      options: [
        { value: 'english', label: 'English' },
        { value: 'hindi', label: 'Hindi' },
        { value: 'malayalam', label: 'Malayalam' },
        { value: 'other', label: 'Other' },
      ],
    },
  },
  language_other: {
    assistant: 'Which language works best for you?',
    input: { kind: 'text', placeholder: 'Preferred language' },
  },
  therapist_gender: {
    assistant: 'Any preference for your therapist’s gender?',
    input: {
      kind: 'single',
      options: [
        { value: 'no_preference', label: 'No preference' },
        { value: 'woman', label: 'Woman' },
        { value: 'man', label: 'Man' },
        { value: 'non_binary', label: 'Non-binary' },
      ],
    },
  },
  therapist_should_know: {
    assistant:
      'Last question. Is there anything you’d like a therapist to know about you? Skip if you’d rather not.',
    input: {
      kind: 'text',
      placeholder: 'Anything you’d like to share',
      optional: true,
      long: true,
    },
  },
}

/** Hovio's lead-in message for each non-question phase. */
export const PHASE_MESSAGES: Record<
  'agreement' | 'consent' | 'suitability',
  string
> = {
  agreement:
    'Thank you for sharing all of that. Before we begin, a couple of quick agreements.',
  consent:
    'Now a few choices about your privacy. You’re always in control of these.',
  suitability:
    'One last check, so we can make sure Hovio is the right kind of support for you.',
}

/*
 * CLINICAL REVIEW REQUIRED: this out-of-scope list and the block-vs-guide policy
 * (we guide off-platform rather than reject) MUST be reviewed and signed off by a
 * licensed mental-health professional before launch. Config-driven on purpose.
 */
export const OUT_OF_SCOPE_CONDITIONS: string[] = [
  'A condition that needs psychiatric (medical) treatment or medication management',
  'Schizophrenia or other psychosis',
  'Bipolar disorder',
  'Dissociative identity disorder',
  'Being in a mental-health emergency, or having active thoughts of harming yourself or others',
]

/** Compute the next step id in the question chain. */
export function computeNext(current: string, a: Partial<Answers>): string {
  switch (current) {
    case 'name':
      return 'country'
    case 'country':
      return 'age'
    case 'age':
      return (a.age ?? 0) < 18 ? 'underage_offramp' : 'gender'
    case 'gender':
      return a.gender === 'self_describe' ? 'gender_self' : 'relationship'
    case 'gender_self':
      return 'relationship'
    case 'relationship':
      return 'tried_therapy'
    case 'tried_therapy':
      return a.tried_therapy ? 'past_therapy_note' : 'financial'
    case 'past_therapy_note':
      return 'financial'
    case 'financial':
      return 'referral'
    case 'referral':
      return a.referral_source === 'other' ? 'referral_other' : 'occupation'
    case 'referral_other':
      return 'occupation'
    case 'occupation':
      return 'concerns'
    case 'concerns':
      return (a.concerns ?? []).includes('something_else')
        ? 'concerns_other'
        : 'support'
    case 'concerns_other':
      return 'support'
    case 'support':
      return 'medication'
    case 'medication':
      return 'language'
    case 'language':
      return (a.preferred_languages ?? []).includes('other')
        ? 'language_other'
        : 'therapist_gender'
    case 'language_other':
      return 'therapist_gender'
    case 'therapist_gender':
      return 'therapist_should_know'
    case 'therapist_should_know':
      return 'agreement'
    default:
      return 'agreement'
  }
}

/** Build the server payload from the collected answers. */
export function buildPayload(
  a: Partial<Answers>,
  suitabilityNoneApply: boolean,
): OnboardingPayload {
  return {
    name: a.name ?? '',
    country: a.country ?? '',
    age: a.age ?? 0,
    gender: a.gender ?? 'prefer_not',
    gender_self_describe: a.gender_self_describe ?? null,
    relationship_status: a.relationship_status ?? 'prefer_not',
    tried_therapy: a.tried_therapy ?? false,
    financial_situation: a.financial_situation ?? 'prefer_not',
    referral_source: a.referral_source ?? 'other',
    referral_other: a.referral_other ?? null,
    occupation: a.occupation ?? null,
    concerns: a.concerns ?? [],
    concerns_other: a.concerns_other ?? null,
    support_system: a.support_system ?? 'prefer_not',
    medication: a.medication ?? 'prefer_not',
    preferred_language:
      a.preferred_languages && a.preferred_languages.length > 0
        ? a.preferred_languages[0]
        : 'english',
    preferred_languages: a.preferred_languages ?? ['english'],
    preferred_language_other: a.preferred_language_other ?? null,
    therapist_gender_preference:
      a.therapist_gender_preference ?? 'no_preference',
    past_therapy_note: a.past_therapy_note ?? null,
    therapist_should_know: a.therapist_should_know ?? null,
    whatsapp_number: a.whatsapp_number ?? null,
    agreement: a.agreement ?? {
      age_confirmed: false,
      terms: false,
      privacy: false,
    },
    consents: a.consents ?? {
      data_processing: false,
      ai_memory: false,
      notifications_whatsapp: false,
      notifications_email: false,
    },
    suitability_none_apply: suitabilityNoneApply,
  }
}
