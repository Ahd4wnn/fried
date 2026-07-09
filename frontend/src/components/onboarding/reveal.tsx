import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { gsap } from '../../motion/gsap'
import { useReducedMotion } from '../../motion/useReducedMotion'
import { TextShimmer } from '../core/text-shimmer'

/** Gentle spring for chat elements arriving/leaving. */
const bubbleSpring = {
  type: 'spring',
  stiffness: 380,
  damping: 30,
  mass: 0.8,
} as const

/**
 * Fade/slide-up a block on mount. `layout="position"` lets siblings glide
 * (rather than jump) when the transcript grows. Reduced motion is handled by
 * the root `<MotionConfig reducedMotion="user">`.
 */
export function Reveal({
  children,
  y = 12,
  className,
}: {
  children: ReactNode
  y?: number
  className?: string
}) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={bubbleSpring}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Stagger direct children in on mount via GSAP. Static under reduced motion. */
export function ChipsReveal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || reduced) return
    const items = Array.from(el.children) as HTMLElement[]
    const tween = gsap.fromTo(
      items,
      { opacity: 0, y: 10, scale: 0.97 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.35,
        stagger: 0.045,
        ease: 'power3.out',
        clearProps: 'opacity,transform',
      },
    )
    return () => {
      tween.kill()
      gsap.set(items, { opacity: 1, y: 0, clearProps: 'opacity,transform' })
    }
  }, [reduced])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/**
 * The "AI is generating" state — TextShimmer inside an aria-live region.
 * A motion element so it can crossfade away inside an `<AnimatePresence>`
 * instead of being swapped out in a single frame.
 */
export function GeneratingIndicator({ label }: { label: string }) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={bubbleSpring}
      aria-live="polite"
      className="flex justify-start"
    >
      <div className="flex items-center gap-2.5 rounded-xl rounded-bl-sm border border-line bg-paper px-4 py-2.5">
        <span aria-hidden className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-forest/40"
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                delay: i * 0.18,
                ease: 'easeInOut',
              }}
            />
          ))}
        </span>
        <TextShimmer as="span" className="text-[0.9375rem]">
          {label}
        </TextShimmer>
      </div>
    </motion.div>
  )
}
