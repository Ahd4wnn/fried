import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type BubbleVariant = 'user' | 'assistant'

interface MessageBubbleProps {
  variant: BubbleVariant
  children: ReactNode
  /** Optional timestamp slot, rendered quietly beneath the bubble. */
  timestamp?: ReactNode
  className?: string
}

/**
 * Chat message bubble for the AI companion (presentational only — no logic).
 * `user` sits right, forest-filled; `assistant` sits left, soft paper.
 */
export function MessageBubble({
  variant,
  children,
  timestamp,
  className,
}: MessageBubbleProps) {
  const isUser = variant === 'user'
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1',
        isUser ? 'items-end' : 'items-start',
        className,
      )}
    >
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-4 py-2.5 text-[0.9375rem] leading-relaxed sm:max-w-[75%]',
          isUser
            ? 'rounded-br-sm bg-forest text-cream'
            : 'rounded-bl-sm border border-line bg-paper text-ink',
        )}
      >
        {children}
      </div>
      {timestamp && (
        <span className="px-1 text-xs text-ink-soft">{timestamp}</span>
      )}
    </div>
  )
}
