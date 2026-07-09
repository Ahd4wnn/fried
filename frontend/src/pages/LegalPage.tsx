import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

interface LegalPageProps {
  title: string
}

/**
 * Placeholder for Privacy / Terms. Real, reviewed legal copy lands later; for
 * now these exist so links and registration consent resolve to real routes.
 */
export function LegalPage({ title }: LegalPageProps) {
  return (
    <main className="mx-auto min-h-svh w-full max-w-2xl px-5 py-12 sm:px-8">
      <Link
        to="/"
        aria-label="Hovio home"
        className="focus-ring inline-block rounded-sm"
      >
        <Logo />
      </Link>
      <h1 className="mt-8 font-display text-4xl text-ink">{title}</h1>
      <p className="mt-4 text-ink-soft">
        The full {title.toLowerCase()} document is being prepared and will
        appear here before launch. Hovio handles your information with care —
        sensitive data is encrypted, and your conversations are never shared
        without your explicit consent.
      </p>
      <Link
        to="/"
        className="focus-ring mt-8 inline-block rounded-sm text-sm font-medium text-forest underline underline-offset-4"
      >
        ← Back home
      </Link>
    </main>
  )
}

export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" />
}

export function TermsPage() {
  return <LegalPage title="Terms of Service" />
}
