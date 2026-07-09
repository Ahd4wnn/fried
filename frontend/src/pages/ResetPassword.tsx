import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthShell } from '../components/auth/AuthShell'
import { Button, Input } from '../components/ui'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Supabase parses the recovery token from the URL and establishes a session.
  useEffect(() => {
    let active = true
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setHasSession(!!data.session)
      setReady(true)
    }
    void check()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session)
      setReady(true)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Those passwords don’t match yet.')
      return
    }
    setLoading(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (authError) {
      setError('We couldn’t update your password. The link may have expired.')
      return
    }
    setDone(true)
    setTimeout(() => navigate('/login', { replace: true }), 1500)
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle={
        ready && !hasSession ? undefined : 'Choose something you’ll remember.'
      }
    >
      {!ready ? (
        <p className="text-center text-sm text-ink-soft">One moment…</p>
      ) : !hasSession ? (
        <p className="text-center text-sm text-ink-soft">
          This reset link is invalid or has expired. Please request a new one
          from the “Forgot your password?” link on the log-in page.
        </p>
      ) : done ? (
        <p className="text-center text-sm text-ink-soft">
          Your password is updated. Taking you to log in…
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
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText="At least 8 characters."
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" className="w-full" loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
