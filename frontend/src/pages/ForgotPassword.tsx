import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthShell } from '../components/auth/AuthShell'
import { Button, Input } from '../components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` },
    )
    setLoading(false)
    if (authError) {
      setError('Something went wrong sending the link. Please try again.')
      return
    }
    setSent(true)
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle={
        sent
          ? undefined
          : 'Enter your email and we’ll send you a link to set a new password.'
      }
      footer={
        <Link
          to="/login"
          className="focus-ring rounded-sm font-medium text-forest underline underline-offset-2"
        >
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <p className="text-center text-sm text-ink-soft">
          If an account exists for{' '}
          <span className="font-medium text-ink">{email}</span>, a reset link is
          on its way. Check your inbox and spam folder.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
