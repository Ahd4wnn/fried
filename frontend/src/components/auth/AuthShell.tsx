import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../Logo'

interface AuthShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  /** Optional row beneath the card (e.g. “Already have an account?”). */
  footer?: ReactNode
}

/** Calm, centered frame for the auth screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-cream px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link
            to="/"
            aria-label="Hovio home"
            className="focus-ring rounded-sm"
          >
            <Logo />
          </Link>
        </div>
        <div className="rounded-xl border border-line bg-paper p-6 shadow-soft sm:p-8">
          <div className="mb-6 space-y-1 text-center">
            <h1 className="font-display text-3xl text-ink">{title}</h1>
            {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && (
          <p className="mt-6 text-center text-sm text-ink-soft">{footer}</p>
        )}
      </div>
    </main>
  )
}

/** Quiet "or" divider between OAuth and email forms. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs uppercase tracking-wide text-ink-soft">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}
