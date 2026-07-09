import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function getInitial(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

/**
 * Tracks the user's `prefers-reduced-motion` setting, live.
 *
 * This is the single source of truth used to gate Lenis and GSAP. Motion
 * components additionally degrade via `<MotionConfig reducedMotion="user">`
 * in the app root (see motion/index.ts notes).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(getInitial)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    // Initial value comes from the useState initializer; just subscribe here.
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
