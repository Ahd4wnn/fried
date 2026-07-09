import { useState } from 'react'
import { motion } from 'motion/react'
import { Siren } from 'lucide-react'
import { cn } from '../../lib/cn'
import { pressScale, pressTransition } from '../../motion/presets'
import { CrisisSheet } from './CrisisSheet'
interface CrisisButtonProps {
  className?: string
  /** Visual treatment: `inline` for nav slots, `floating` to pin bottom-right. */
  variant?: 'inline' | 'floating'
  compact?: boolean
}

/**
 * Persistent, calm "Get help now" affordance meant to sit on every
 * authenticated screen. Independent of the AI — reachable even mid-typing.
 */
export function CrisisButton({
  className,
  variant = 'inline',
  compact = false,
}: CrisisButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={pressScale}
        transition={pressTransition}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-forest/20 bg-paper font-medium text-forest shadow-soft transition-colors hover:bg-forest-tint',
          compact ? 'w-10 h-10 px-0 gap-0' : 'h-11 px-4',
          variant === 'floating' &&
            'fixed bottom-5 right-5 z-40 md:bottom-6 md:right-6',
          className,
        )}
      >
        <Siren aria-hidden="true" className="h-5 w-5 shrink-0" />
        {!compact && <span>Get help now</span>}
      </motion.button>
      <CrisisSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
