/**
 * Motion layer barrel.
 *
 * Global reduced-motion guard: wrap the app root in
 * `<MotionConfig reducedMotion="user">` (see main.tsx) so every Motion preset
 * here degrades to opacity-only / instant automatically. Lenis and GSAP are
 * gated separately via `useReducedMotion()`.
 */
export { useReducedMotion } from './useReducedMotion'
export { LenisProvider } from './LenisProvider'
export { useLenis } from './lenis-context'
export { gsap, ScrollTrigger, scrollReveal } from './gsap'
export {
  fadeUp,
  staggerChildren,
  sheetSpring,
  pressScale,
  pressTransition,
} from './presets'
