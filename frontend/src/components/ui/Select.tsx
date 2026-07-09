import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  helperText?: string
  error?: string
}

/**
 * Styled native <select> — used in simple form contexts.
 * For rich menus with icons / animations, use <Dropdown> instead.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, helperText, error, id, className, children, ...props },
    ref,
  ) {
    const autoId = useId()
    const fieldId = id ?? autoId
    const helpId = `${fieldId}-help`
    const errId = `${fieldId}-error`
    const describedBy = error ? errId : helperText ? helpId : undefined

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={fieldId}
            className="text-[10px] font-semibold uppercase tracking-widest text-ink-soft/70"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              // Base
              'focus-ring w-full appearance-none rounded-xl border bg-paper px-4 py-2.5 pr-10',
              'text-sm font-medium text-ink transition-all duration-200',
              'placeholder:text-ink-soft/50',
              'disabled:cursor-not-allowed disabled:opacity-50',
              // States
              error
                ? 'border-danger/60 focus:border-danger focus:ring-1 focus:ring-danger/10'
                : 'border-line/70 hover:border-forest/30 focus:border-forest/30 focus:ring-1 focus:ring-forest/10 focus:shadow-soft',
              className,
            )}
            {...props}
          >
            {children}
          </select>

          {/* Custom chevron */}
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-soft/60">
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>

        {error ? (
          <p id={errId} className="text-xs text-danger">
            {error}
          </p>
        ) : helperText ? (
          <p id={helpId} className="text-xs text-ink-soft">
            {helperText}
          </p>
        ) : null}
      </div>
    )
  },
)
