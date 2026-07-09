import { z } from 'zod'

/**
 * Validate the public (VITE_*) environment at boundary, once, at startup.
 * Anon key only — the service-role key never reaches the browser.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_API_BASE_URL: z.string().url(),
  VITE_LIVEKIT_URL: z.string().optional().default(''),
  VITE_RAZORPAY_KEY_ID: z.string().optional().default(''),
})

const parsed = schema.safeParse(import.meta.env)

if (!parsed.success) {
  // Surface a clear, actionable message — no secret values are printed.
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
  throw new Error(
    `Invalid or missing frontend environment variables: ${missing}. ` +
      `Copy .env.example to .env.local and fill them in.`,
  )
}

export const env = parsed.data
