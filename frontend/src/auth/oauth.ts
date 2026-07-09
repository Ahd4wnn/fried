import { supabase } from '../lib/supabase'
import { PENDING_ROLE_KEY } from './auth-context'
import type { AssignableRole } from './types'

/**
 * Start Google OAuth. If a role was chosen (on /register), stash it so it can be
 * applied after the redirect round-trip. Returns to /login, where the route
 * guard sends the user onward once their session + profile resolve.
 */
export async function continueWithGoogle(
  pendingRole?: AssignableRole,
): Promise<void> {
  if (pendingRole) localStorage.setItem(PENDING_ROLE_KEY, pendingRole)
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/login` },
  })
  if (error) throw error
}
