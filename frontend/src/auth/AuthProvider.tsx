import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { api, ApiError } from '../lib/api'
import type { Me } from './types'
import {
  AuthContext,
  PENDING_ROLE_KEY,
  type AuthContextValue,
} from './auth-context'

function readPendingRole(): 'seeker' | 'therapist' | null {
  const value = localStorage.getItem(PENDING_ROLE_KEY)
  return value === 'seeker' || value === 'therapist' ? value : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  // `undefined` = not resolved yet; `null` = resolved & signed out; string = user id.
  const currentUserId = useRef<string | null | undefined>(undefined)

  // Bootstrap the session and subscribe to auth changes.
  useEffect(() => {
    let mounted = true
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session)
      setReady(true)
    }
    void init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Resolve the profile (/me) whenever the signed-in user changes.
  useEffect(() => {
    if (!ready) return
    const userId = session?.user.id ?? null

    // Skip when the signed-in user hasn't changed (e.g. only the token
    // refreshed). The undefined sentinel ensures the signed-out case still
    // resolves loading on first run.
    if (userId === currentUserId.current) return
    currentUserId.current = userId

    let active = true
    const load = async () => {
      if (!userId) {
        setMe(null)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        let profile = await api.getMe()
        // Apply a role chosen before an OAuth redirect, if not yet set.
        const pending = readPendingRole()
        if (!profile.role_set && pending) {
          try {
            profile = await api.setRole(pending)
          } catch (err) {
            // Surface only unexpected failures; a 409 means it was already set.
            if (!(err instanceof ApiError) || err.status !== 409) throw err
          } finally {
            localStorage.removeItem(PENDING_ROLE_KEY)
          }
        }
        if (active) setMe(profile)
      } catch {
        if (active) {
          setMe(null)
          // A failed load must not poison the cache: clear the resolved-user
          // marker so the next auth event (a fresh sign-in or token refresh)
          // retries /me instead of short-circuiting on the id guard above.
          currentUserId.current = undefined
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [ready, session])

  const refreshMe = useCallback(async () => {
    if (!session) {
      setMe(null)
      return
    }
    try {
      setMe(await api.getMe())
    } catch {
      setMe(null)
    }
  }, [session])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setMe(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, me, loading, refreshMe, signOut }),
    [session, me, loading, refreshMe, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
