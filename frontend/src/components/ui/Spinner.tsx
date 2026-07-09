import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

interface SpinnerProps {
  className?: string
  /** Accessible label; defaults to "Loading". */
  label?: string
}

/** A quiet loading indicator. Respects reduced motion via CSS (see index.css). */
export function Spinner({ className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className="inline-flex">
      <LoaderCircle
        aria-hidden="true"
        className={cn('h-4 w-4 animate-spin text-current', className)}
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
