import { useState } from 'react'
import { User } from 'lucide-react'
import { cn } from '../../lib/cn'

type AvatarSize = 'sm' | 'md' | 'lg'

interface AvatarProps {
  name?: string
  src?: string
  size?: AvatarSize
  className?: string
}

const sizes: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

function initials(name?: string): string {
  if (!name) return ''
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Circular avatar with image, then initials, then a neutral icon fallback. */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = src && !failed
  const text = initials(name)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest-tint font-medium text-forest-deep',
        sizes[size],
        className,
      )}
      role="img"
      aria-label={name ? `${name}'s avatar` : 'Avatar'}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : text ? (
        text
      ) : (
        <User aria-hidden="true" className="h-1/2 w-1/2" />
      )}
    </span>
  )
}
