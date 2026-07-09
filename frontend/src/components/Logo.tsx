import { useState } from 'react'
import { cn } from '../lib/cn'

interface LogoProps {
  /** 'dark' logo for light backgrounds, 'white' for dark backgrounds. */
  variant?: 'dark' | 'white'
  className?: string
}

/**
 * Brand logo. Loads /logo.png (or /logo-white.png) from the shared assets
 * folder (served via Vite publicDir), falling back to the Instrument Serif
 * wordmark until the user drops the image files in.
 */
export function Logo({ variant = 'dark', className }: LogoProps) {
  const [failed, setFailed] = useState(false)
  // ?v busts caches poisoned by an earlier deploy that served HTML at these
  // paths with a 200. Bump it if the logo files ever change.
  const src = variant === 'white' ? '/logo-white.png?v=2' : '/logo.png?v=2'

  if (failed) {
    return (
      <span
        className={cn(
          'font-display text-2xl leading-none',
          variant === 'white' ? 'text-cream' : 'text-forest',
          className,
        )}
      >
        Hovio
      </span>
    )
  }

  return (
    <img
      src={src}
      alt="Hovio"
      onError={() => setFailed(true)}
      className={cn('h-8 w-auto', className)}
    />
  )
}
