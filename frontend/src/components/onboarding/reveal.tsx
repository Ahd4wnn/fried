import { useEffect, useRef, type ReactNode } from 'react'
import { gsap } from '../../motion/gsap'
import { useReducedMotion } from '../../motion/useReducedMotion'
import { TextShimmer } from '../core/text-shimmer'

/** Fade/slide-up a block on mount via GSAP. Static under reduced motion. */
export function Reveal({
  children,
  y = 12,
  className,
}: {
  children: ReactNode
  y?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || reduced) return
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y },
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
        clearProps: 'opacity,transform',
      },
    )
    return () => {
      tween.kill()
      gsap.set(el, { opacity: 1, y: 0, clearProps: 'opacity,transform' })
    }
  }, [reduced, y])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
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
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.3,
        stagger: 0.05,
        ease: 'power2.out',
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

/** The "AI is generating" state — TextShimmer inside an aria-live region. */
export function GeneratingIndicator({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="flex justify-start">
      <div className="rounded-xl rounded-bl-sm border border-line bg-paper px-4 py-2.5">
        <TextShimmer as="span" className="text-[0.9375rem]">
          {label}
        </TextShimmer>
      </div>
    </div>
  )
}
