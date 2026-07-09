import { LinkButton } from '../components/ui'
import { Logo } from '../components/Logo'

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-cream px-6 text-center">
      <Logo />
      <div className="space-y-2">
        <h1 className="font-display text-4xl text-ink">Page not found</h1>
        <p className="text-ink-soft">
          That page doesn’t exist, or may have moved.
        </p>
      </div>
      <LinkButton to="/">Back home</LinkButton>
    </main>
  )
}
