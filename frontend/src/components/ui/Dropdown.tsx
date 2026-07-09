import {
  useState,
  useRef,
  useEffect,
  useId,
  type ReactNode,
  type KeyboardEvent,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, Lock } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface DropdownOption {
  value: string
  label: string
  sublabel?: string
  icon?: ReactNode
  disabled?: boolean
  locked?: boolean
}

interface DropdownProps {
  /** Current selected value */
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  /** Placeholder shown when no value selected */
  placeholder?: string
  label?: string
  /** Applied to the outer wrapper */
  className?: string
  /** Dark mode — for use inside dark surfaces (e.g. sidebar) */
  dark?: boolean
}

/**
 * Premium animated dropdown — floating panel, keyboard navigable,
 * with accent colors and motion. Replaces native <select>.
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  label,
  className,
  dark = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const triggerId = useId()
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selected = options.find((o) => o.value === value)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setFocusIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setFocusIdx(-1)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Focus the highlighted option
  useEffect(() => {
    if (open && focusIdx >= 0) {
      optionRefs.current[focusIdx]?.focus()
    }
  }, [open, focusIdx])

  const enabledOptions = options.filter((o) => !o.disabled && !o.locked)

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
        setFocusIdx(0)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx((i) => Math.min(i + 1, enabledOptions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setFocusIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setFocusIdx(enabledOptions.length - 1)
    }
  }

  const selectOption = (opt: DropdownOption) => {
    if (opt.disabled || opt.locked) return
    onChange(opt.value)
    setOpen(false)
    setFocusIdx(-1)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && (
        <label
          id={`${triggerId}-label`}
          className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-ink-soft/70"
        >
          {label}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        id={triggerId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={label ? `${triggerId}-label ${triggerId}` : undefined}
        onClick={() => {
          setOpen((v) => !v)
          setFocusIdx(open ? -1 : 0)
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'focus-ring flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
          dark
            ? 'border-cream/10 bg-cream/8 text-cream/80 hover:bg-cream/12 hover:text-cream'
            : 'border-line/70 bg-paper text-ink hover:border-forest/30 hover:shadow-soft',
          open && (dark
            ? 'border-cream/20 bg-cream/12 text-cream'
            : 'border-forest/30 ring-1 ring-forest/10 shadow-soft'),
        )}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {selected?.icon && (
            <span className={cn('shrink-0', dark ? 'text-cream/60' : 'text-ink-soft')}>
              {selected.icon}
            </span>
          )}
          <span className="truncate">
            {selected ? selected.label : (
              <span className={dark ? 'text-cream/35' : 'text-ink-soft/50'}>
                {placeholder}
              </span>
            )}
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="shrink-0"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-colors',
              dark ? 'text-cream/40' : 'text-ink-soft/60',
              open && (dark ? 'text-cream/70' : 'text-forest'),
            )}
          />
        </motion.span>
      </button>

      {/* Floating panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border shadow-lift',
              dark
                ? 'bg-[#232523] border-[#3A3D3A]'
                : 'bg-paper border-line/70',
            )}
          >
            <ul className="py-1.5 max-h-64 overflow-y-auto scrollbar-thin">
              {options.map((opt) => {
                const isSelected = opt.value === value
                const isDisabled = opt.disabled || opt.locked
                const enabledIdx = enabledOptions.indexOf(opt)

                return (
                  <li key={opt.value} role="option" aria-selected={isSelected}>
                    <button
                      ref={(el) => {
                        if (enabledIdx >= 0) optionRefs.current[enabledIdx] = el
                      }}
                      type="button"
                      onClick={() => selectOption(opt)}
                      disabled={isDisabled}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-all duration-150',
                        'focus:outline-none',
                        isDisabled && 'opacity-40 cursor-not-allowed',
                        !isDisabled && (dark
                          ? 'hover:bg-cream/8 focus:bg-cream/8'
                          : 'hover:bg-cream focus:bg-cream'),
                        isSelected && !dark && 'bg-forest-tint/60 text-forest',
                        isSelected && dark && 'bg-cream/10 text-cream',
                        !isSelected && (dark ? 'text-cream/75' : 'text-ink'),
                      )}
                    >
                      {/* Icon badge */}
                      {opt.icon && (
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                            isSelected
                              ? 'bg-forest text-cream'
                              : dark
                                ? 'bg-cream/10 text-cream/50'
                                : 'bg-line/60 text-ink-soft',
                          )}
                        >
                          {opt.icon}
                        </span>
                      )}

                      {/* Labels */}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{opt.label}</span>
                        {opt.sublabel && (
                          <span
                            className={cn(
                              'block text-xs mt-0.5',
                              dark ? 'text-cream/40' : 'text-ink-soft/60',
                            )}
                          >
                            {opt.sublabel}
                          </span>
                        )}
                      </span>

                      {/* Right side: lock or checkmark */}
                      {opt.locked ? (
                        <Lock className={cn('h-3.5 w-3.5 shrink-0', dark ? 'text-cream/30' : 'text-ink-soft/30')} />
                      ) : isSelected ? (
                        <Check className="h-4 w-4 shrink-0 text-forest" />
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
