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
  const src = variant === 'white' ? '/logo-white.png' : '/logo.png'

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
