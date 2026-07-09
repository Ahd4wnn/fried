import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * GSAP + ScrollTrigger setup. Used for orchestrated reveals on long
 * marketing-style surfaces (welcome / onboarding) — NOT applied anywhere yet
 * (that wiring comes with those prompts).
 */
gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }

interface ScrollRevealOptions {
  /**
   * The element that drives the ScrollTrigger (usually the container the
   * targets live in). Must be a single element — a NodeList is NOT a valid
   * trigger. Defaults to the first target.
   */
  trigger?: Element | null
  /** Vertical offset (px) the element rises from. */
  y?: number
  /** Animation duration in seconds. */
  duration?: number
  /** Stagger between multiple targets, in seconds. */
  stagger?: number
  /** Respect reduced motion — when true, content appears instantly. */
  reducedMotion?: boolean
  /** ScrollTrigger start position. */
  start?: string
}

/**
 * Orchestrated scroll-reveal helper. Targets fade and rise in when the
 * `trigger` element enters the viewport, then stay (plays once). Returns a
 * disposer to clean up the ScrollTrigger.
 *
 * Robustness notes:
 * - Pass a single `trigger` element (e.g. the grid container). A NodeList is
 *   not a valid trigger and would never fire.
 * - Uses an explicit `onEnter` rather than a from-tween bound to ScrollTrigger,
 *   and fires immediately if the trigger is already in view at creation
 *   (above-the-fold sections) — a from-tween "born active" with `once` would
 *   otherwise stay parked at opacity:0.
 */
export function scrollReveal(
  targets: gsap.TweenTarget,
  options: ScrollRevealOptions = {},
): () => void {
  const {
    trigger,
    y = 24,
    duration = 0.6,
    stagger = 0.08,
    reducedMotion = false,
    start = 'top 85%',
  } = options

  if (reducedMotion) {
    // Instant, opacity-only — no transform, no scrub.
    gsap.set(targets, { opacity: 1, y: 0, clearProps: 'transform' })
    return () => {}
  }

  const reveal = () =>
    gsap.to(targets, {
      opacity: 1,
      y: 0,
      duration,
      stagger,
      ease: 'power2.out',
      overwrite: 'auto',
    })

  // Start hidden, then reveal on enter (or right away if already in view).
  gsap.set(targets, { opacity: 0, y })
  const st = ScrollTrigger.create({
    trigger: trigger ?? undefined,
    start,
    once: true,
    onEnter: reveal,
  })
  if (st.isActive) reveal()

  return () => st.kill()
}
