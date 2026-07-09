import { Phone } from 'lucide-react'
import { useHelplines } from './useHelplines'
import { Card } from '../ui'

interface CrisisInterstitialProps {
  onCloseSession: () => void
}

/** Tel link target — digits and + only. */
function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`
}

/**
 * CrisisInterstitial — displayed mid-session when safety evaluation triggers a crisis.
 * Warm, direct, non-judgmental, and never clinical or alarmist (design-system.md).
 */
export function CrisisInterstitial({
  onCloseSession,
}: CrisisInterstitialProps) {
  const { helplines } = useHelplines()

  return (
    <div className="mx-auto max-w-xl py-8 px-4 text-center space-y-6 animate-fadeIn select-none">
      {/* CLINICAL REVIEW REQUIRED */}
      <header className="space-y-3">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-forest-tint text-forest">
          <Phone aria-hidden="true" className="h-7 w-7" />
        </span>
        <h1 className="font-display text-3xl text-ink">
          We want to make sure you're safe
        </h1>
        <p className="text-ink-soft max-w-md mx-auto">
          It sounds like you're going through a very difficult moment right now.
          Hovio's companion is a supportive listener, but you deserve real human
          care. We have paused our chat session so you can connect with someone
          who can support you directly.
        </p>
      </header>

      {/* CLINICAL REVIEW REQUIRED */}
      <Card className="text-left border border-forest/10 p-5 space-y-4 bg-paper/50 backdrop-blur-sm">
        <p className="text-sm font-semibold text-forest-deep">
          Please consider reaching out to one of these free, confidential crisis
          resources:
        </p>
        <ul className="flex flex-col gap-3">
          {helplines.map((line) => (
            <li
              key={line.name}
              className="rounded-lg border border-forest/10 bg-forest-tint/30 p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-ink">
                  {line.name}
                </span>
                <span className="text-xs text-ink-soft">{line.hours}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {line.numbers.map((num) => (
                  <a
                    key={num}
                    href={telHref(num)}
                    className="focus-ring flex items-center justify-between rounded-md border border-forest-300/20 bg-paper px-3 py-1.5 text-sm text-forest hover:bg-forest-tint transition-colors"
                  >
                    <span className="font-medium">{num}</span>
                    <span className="text-xs text-ink-soft">Tap to call</span>
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="pt-2">
        <button
          type="button"
          onClick={onCloseSession}
          className="focus-ring inline-flex h-11 items-center justify-center rounded-full bg-forest px-8 text-sm font-semibold text-cream shadow-md transition-all hover:bg-forest-deep hover:scale-[1.02]"
        >
          I understand
        </button>
      </div>
    </div>
  )
}
