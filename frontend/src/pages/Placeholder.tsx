/**
 * Prompt 1 placeholder — a calm, centered surface that proves the design tokens
 * (cream background, Instrument Serif display) are wired. The real welcome page
 * and UI kit arrive in later prompts.
 */
export default function Placeholder() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-cream px-6 text-center">
      <h1 className="font-display text-5xl text-forest">Hovio</h1>
      <p className="mt-4 max-w-sm text-base text-ink-soft">
        A calm place to talk things through.
      </p>
    </main>
  )
}
