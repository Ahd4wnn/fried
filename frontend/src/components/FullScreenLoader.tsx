import { Spinner } from './ui'

/** Calm full-viewport loading state while auth/profile resolve. */
export function FullScreenLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-cream text-forest">
      <Spinner label="Loading" />
    </div>
  )
}
