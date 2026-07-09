import Lenis from 'lenis'
import { useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from './useReducedMotion'
import { LenisContext } from './lenis-context'
import { gsap, ScrollTrigger } from './gsap'

interface LenisProviderProps {
  children: ReactNode
  /**
   * Enable smooth scroll. Keep this ON for long marketing-style surfaces
   * (welcome / onboarding) and OFF for dashboard/chat where it fights native
   * scroll. Always disabled under reduced motion regardless of this value.
   */
  enabled?: boolean
}

/**
 * Smooth-scroll provider built on Lenis, integrated with GSAP ScrollTrigger
 * (the canonical setup): GSAP's ticker drives Lenis, and every Lenis scroll
 * updates ScrollTrigger so scroll-reveals fire correctly. Mounts only when
 * `enabled` and the user hasn't requested reduced motion; otherwise it's a
 * transparent passthrough using native scrolling.
 */
export function LenisProvider({
  children,
  enabled = true,
}: LenisProviderProps) {
  const reduced = useReducedMotion()
  const active = enabled && !reduced
  const [lenis, setLenis] = useState<Lenis | null>(null)

  useEffect(() => {
    // When inactive (dashboard/chat or reduced motion), stay on native scroll.
    if (!active) return

    const instance = new Lenis({ smoothWheel: true })
    // Storing the imperatively-created external instance so consumers can read
    // it via context — this is the intended "sync with external system" case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLenis(instance)

    // Keep ScrollTrigger in sync with Lenis's scroll position.
    const onScroll = () => ScrollTrigger.update()
    instance.on('scroll', onScroll)

    // Drive Lenis from GSAP's ticker (seconds → ms) instead of a raw rAF loop.
    const onTick = (time: number) => instance.raf(time * 1000)
    gsap.ticker.add(onTick)
    gsap.ticker.lagSmoothing(0)

    // Positions can shift as fonts/layout settle.
    ScrollTrigger.refresh()

    return () => {
      gsap.ticker.remove(onTick)
      instance.off('scroll', onScroll)
      instance.destroy()
      setLenis(null)
    }
  }, [active])

  return (
    <LenisContext.Provider value={{ lenis }}>{children}</LenisContext.Provider>
  )
}
