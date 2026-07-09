import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Me } from './types'

export interface AuthContextValue {
  session: Session | null
  me: Me | null
  /** True until the initial session + profile resolve. */
  loading: boolean
  refreshMe: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

/** Where an authenticated user should land, given their /me state. */
export function destinationFor(me: Me | null): string {
  if (!me) return '/login'
  if (!me.role_set) return '/register'
  if (me.role === 'admin') return '/admin/dashboard'
  if (me.role === 'therapist') {
    return me.onboarding_completed ? '/therapist/dashboard' : '/onboarding'
  }
  if (!me.onboarding_completed) return '/onboarding'
  return '/dashboard'
}

/** localStorage key holding the role chosen before a Google OAuth round-trip. */
export const PENDING_ROLE_KEY = 'hovio_pending_role'
