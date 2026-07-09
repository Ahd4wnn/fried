import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { motion } from 'motion/react'
import { cn } from '../../lib/cn'

export interface TabItem {
  id: string
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  /** Controlled active id. Omit for uncontrolled. */
  value?: string
  defaultValue?: string
  onValueChange?: (id: string) => void
  className?: string
}

/** Keyboard-navigable tabs with an animated active indicator. */
export function Tabs({
  tabs,
  value,
  defaultValue,
  onValueChange,
  className,
}: TabsProps) {
  const baseId = useId()
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id)
  const active = value ?? internal
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (id: string) => {
    if (value === undefined) setInternal(id)
    onValueChange?.(id)
  }

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    let next: number
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (e.key === 'ArrowLeft')
      next = (index - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    const tab = tabs[next]
    select(tab.id)
    refs.current[next]?.focus()
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Tabs"
        className="relative flex gap-1 border-b border-line"
      >
        {tabs.map((tab, i) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'focus-ring relative rounded-sm px-3.5 py-2.5 text-sm font-medium transition-colors',
                selected ? 'text-forest' : 'text-ink-soft hover:text-ink',
              )}
            >
              {tab.label}
              {selected && (
                <motion.span
                  layoutId={`${baseId}-indicator`}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-forest"
                  transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                />
              )}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="focus-ring rounded-md pt-4"
        >
          {tab.id === active && tab.content}
        </div>
      ))}
    </div>
  )
}
