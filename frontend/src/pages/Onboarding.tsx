import { Navigate } from 'react-router-dom'
import { useAuth, destinationFor } from '../auth/auth-context'
import { OnboardingChat } from '../components/onboarding/OnboardingChat'
import { TherapistOnboardingChat } from '../components/onboarding/TherapistOnboardingChat'

/**
 * Seeker and Therapist onboarding — a calm, chat-like conversation (Prompt 4/9).
 * Re-entering after completion redirects to the dashboard.
 */
export default function Onboarding() {
  const { me } = useAuth()

  if (me?.onboarding_completed) {
    return <Navigate to={destinationFor(me)} replace />
  }

  if (me?.role === 'therapist') {
    return <TherapistOnboardingChat />
  }

  return <OnboardingChat />
}
