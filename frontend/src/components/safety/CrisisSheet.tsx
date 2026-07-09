import { Phone } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { useHelplines } from './useHelplines'

interface CrisisSheetProps {
  open: boolean
  onClose: () => void
}

/** Tel link target — digits and + only. */
function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`
}

/**
 * Calm, supportive helpline sheet. Deliberately NOT error-red — it reads as
 * support, not alarm (design-system.md / safety-and-privacy.md).
 */
export function CrisisSheet({ open, onClose }: CrisisSheetProps) {
  const { helplines } = useHelplines()

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="You don't have to face this alone"
      description="If you're in distress, these lines are free, confidential, and ready to listen right now."
    >
      <ul className="flex flex-col gap-3">
        {helplines.map((line) => (
          <li
            key={line.name}
            className="rounded-lg border border-forest/15 bg-forest-tint/40 p-4 space-y-3"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest text-cream">
                <Phone aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{line.name}</span>
                <span className="block text-sm text-ink-soft">
                  Hours: {line.hours}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {line.numbers.map((num) => (
                <a
                  key={num}
                  href={telHref(num)}
                  className="focus-ring flex items-center justify-between rounded-md border border-forest-300/25 bg-paper px-3 py-2 text-sm font-medium text-forest hover:bg-forest-tint transition-colors"
                >
                  <span>Call {num}</span>
                  <span className="text-xs text-ink-soft">Tap to call</span>
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-soft">
        If there is an immediate risk to life, please contact local emergency
        services.
      </p>
    </Sheet>
  )
}
