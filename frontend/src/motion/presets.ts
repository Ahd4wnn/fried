import type { Transition, Variants } from 'motion/react'

/**
 * Shared Motion presets — springs over linear easings, durations 150–350ms
 * (docs/design-system.md). When the user prefers reduced motion, these degrade
 * automatically because the app root wraps everything in
 * `<MotionConfig reducedMotion="user">`, which strips transforms and keeps only
 * opacity.
 */

/** Gentle rise-and-fade for entering content. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  },
}

/** Container that staggers its children's `fadeUp` (or any) entrance. */
export const staggerChildren: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

/** Spring used for sheets/modals entering and leaving. */
export const sheetSpring: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 32,
  mass: 0.9,
}

/** Press feedback for buttons and tappable surfaces (use as `whileTap`). */
export const pressScale = { scale: 0.97 } as const

/** Springy tap transition paired with `pressScale`. */
export const pressTransition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 25,
}
