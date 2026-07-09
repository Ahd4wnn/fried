import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { HeartHandshake, Stethoscope } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { api, ApiError } from '../lib/api'
import { useAuth, PENDING_ROLE_KEY } from '../auth/auth-context'
import type { AssignableRole } from '../auth/types'
import { AuthShell, OrDivider } from '../components/auth/AuthShell'
import { GoogleButton } from '../components/auth/GoogleButton'
import { Button, Input } from '../components/ui'
import { cn } from '../lib/cn'

const ROLE_OPTIONS: {
  value: AssignableRole
  label: string
  description: string
  icon: typeof HeartHandshake
}[] = [
  {
    value: 'seeker',
    label: 'I’m looking for support',
    description:
      'Talk to an AI companion and, if you’d like, a verified therapist.',
    icon: HeartHandshake,
  },
  {
    value: 'therapist',
    label: 'I’m a therapist',
    description: 'Offer verified professional care to people who need it.',
    icon: Stethoscope,
  },
]

function RoleSelector({
  value,
  onChange,
}: {
  value: AssignableRole | null
  onChange: (role: AssignableRole) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-ink">
        How will you use Hovio?
      </legend>
      <div className="grid gap-2" role="radiogroup" aria-label="Account type">
        {ROLE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const selected = value === opt.value
          return (
            <label
              key={opt.value}
              className={cn(
                'focus-within:ring-2 focus-within:ring-forest focus-within:ring-offset-2 focus-within:ring-offset-paper',
                'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                selected
                  ? 'border-forest bg-forest-tint/50'
                  : 'border-line bg-paper hover:border-ink-soft/40',
              )}
            >
              <input
                type="radio"
                name="role"
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-tint text-forest">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {opt.label}
                </span>
                <span className="block text-sm text-ink-soft">
                  {opt.description}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Compact role chooser for an already-authenticated user without a role yet. */
function CompleteRole() {
  const { refreshMe } = useAuth()
  const [role, setRole] = useState<AssignableRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onContinue = async () => {
    if (!role) {
      setError('Please choose how you’ll use Hovio.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await api.setRole(role)
      await refreshMe()
      // The route guard now redirects onward.
    } catch (err) {
      setLoading(false)
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      )
    }
  }

  return (
    <AuthShell
      title="One last step"
      subtitle="Tell us how you’ll use Hovio to finish setting up."
    >
      <div className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        <RoleSelector value={role} onChange={setRole} />
        <Button className="w-full" loading={loading} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </AuthShell>
  )
}

export default function Register() {
  const { session, me } = useAuth()

  // Already signed in but no role yet (e.g. via Google) → finish role selection.
  if (session && me && !me.role_set) {
    return <CompleteRole />
  }

  return <SignUpForm />
}

function SignUpForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<AssignableRole | null>(null)
  const [isAdult, setIsAdult] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Please enter your name.'
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      next.email = 'Enter a valid email address.'
    if (password.length < 8) next.password = 'Use at least 8 characters.'
    if (confirm !== password) next.confirm = 'Those passwords don’t match yet.'
    if (!role) next.role = 'Please choose how you’ll use Hovio.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!isAdult) {
      // The checkbox is also `required`; this is a friendly belt-and-braces.
      setFormError('You need to confirm you’re 18 or older to use Hovio.')
      return
    }
    if (!validate() || !role) return

    setLoading(true)
    // Stash the chosen role so it’s applied once a session exists (covers both
    // immediate sessions and email-confirmation flows).
    localStorage.setItem(PENDING_ROLE_KEY, role)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })

    if (error) {
      setLoading(false)
      localStorage.removeItem(PENDING_ROLE_KEY)
      setFormError(
        'We couldn’t create your account. This email may already be registered — try logging in instead.',
      )
      return
    }

    if (!data.session) {
      // Email confirmation required — role is applied on first sign-in.
      setLoading(false)
      setCheckEmail(true)
      return
    }
    // Session is active: AuthProvider applies the role and the guard redirects.
  }

  if (checkEmail) {
    return (
      <AuthShell title="Check your email">
        <p className="text-center text-sm text-ink-soft">
          We’ve sent a confirmation link to{' '}
          <span className="font-medium text-ink">{email}</span>. Open it to
          finish setting up your account, then log in.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It’s free to start a conversation."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="focus-ring rounded-sm font-medium text-forest underline underline-offset-2"
          >
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton pendingRole={role ?? undefined} onError={setFormError} />
      <OrDivider />

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        )}
        <Input
          label="Name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          helperText={errors.password ? undefined : 'At least 8 characters.'}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />

        <div>
          <RoleSelector value={role} onChange={setRole} />
          {errors.role && (
            <p className="mt-1 text-sm text-danger">{errors.role}</p>
          )}
        </div>

        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            required
            checked={isAdult}
            onChange={(e) => setIsAdult(e.target.checked)}
            className="focus-ring mt-0.5 h-4 w-4 rounded border-line text-forest accent-forest"
          />
          <span>I am 18 years of age or older.</span>
        </label>

        <p className="text-xs text-ink-soft">
          By creating an account you agree to our{' '}
          <Link
            to="/terms"
            className="focus-ring rounded-sm text-forest underline underline-offset-2"
          >
            Terms
          </Link>{' '}
          and{' '}
          <Link
            to="/privacy"
            className="focus-ring rounded-sm text-forest underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </p>

        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}
