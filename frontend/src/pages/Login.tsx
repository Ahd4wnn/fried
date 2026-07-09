import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthShell, OrDivider } from '../components/auth/AuthShell'
import { GoogleButton } from '../components/auth/GoogleButton'
import { Button, Input } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (authError) {
      setLoading(false)
      setError(
        'That email and password don’t match. Check them and try again, or reset your password below.',
      )
      return
    }
    // Success: the route guard redirects once the session + profile resolve.
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue."
      footer={
        <>
          New to Hovio?{' '}
          <Link
            to="/register"
            className="focus-ring rounded-sm font-medium text-forest underline underline-offset-2"
          >
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton onError={setError} />
      <OrDivider />

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
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="focus-ring rounded-sm text-sm text-ink-soft hover:text-ink"
          >
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Log in
        </Button>
      </form>
    </AuthShell>
  )
}
