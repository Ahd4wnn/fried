import { createClient } from '@supabase/supabase-js'
import { env } from './env'

/**
 * Browser Supabase client — anon key + the signed-in user's JWT only.
 * Authorization is enforced by the backend; RLS is defense-in-depth.
 */
export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
