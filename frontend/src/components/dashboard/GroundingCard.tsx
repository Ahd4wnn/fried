import { Card } from '../ui'

// A small, calm, rotating set — gentle prompts, not a mood scale or anything
// clinical.
const GROUNDING_LINES = [
  'Notice three things you can hear right now.',
  "Take one slow breath. There's no rush.",
  'Unclench your jaw and drop your shoulders.',
  "Name one small thing you're grateful for today.",
  'Feel your feet on the floor for a moment.',
  "You've made it this far. That counts for something.",
  'Let this next breath be a little longer than the last.',
]

// Picked once at module load (the app reloads across days) — keeps render pure.
const dayIndex = Math.floor(Date.now() / 86_400_000)
const TODAY_LINE = GROUNDING_LINES[dayIndex % GROUNDING_LINES.length]

/** One quietly-styled grounding line, rotating by day. */
export function GroundingCard() {
  const line = TODAY_LINE

  return (
    <Card className="relative overflow-hidden rounded-3xl border-none shadow-soft bg-[#F8EDC8]/50 p-10 flex flex-col items-center justify-center text-center select-none min-h-[220px]">
      {/* Warm organic blur blobs for butter/golden warmth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-accent-butter opacity-70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-4 bottom-0 h-24 w-24 rounded-full bg-accent-blush opacity-50 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-4 bottom-4 h-20 w-20 rounded-full bg-accent-sage opacity-40 blur-2xl"
      />

      <div className="relative z-10 max-w-lg space-y-4">
        <p className="font-display text-3xl sm:text-4xl italic leading-relaxed text-ink font-normal">
          "{line}"
        </p>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-soft/70">
          A moment for you
        </p>
      </div>
    </Card>
  )
}
