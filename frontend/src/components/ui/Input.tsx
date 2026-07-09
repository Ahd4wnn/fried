import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helperText?: string
  /** Calm, non-alarmist error message. Sets aria-invalid + danger styling. */
  error?: string
}

export const fieldBase =
  'focus-ring w-full rounded-md border bg-paper px-3.5 text-ink placeholder:text-ink-soft/60 transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, id, className, ...props },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const helpId = `${inputId}-help`
  const errId = `${inputId}-error`
  const describedBy = error ? errId : helperText ? helpId : undefined

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          fieldBase,
          'h-11',
          error ? 'border-danger' : 'border-line hover:border-ink-soft/40',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errId} className="text-sm text-danger">
          {error}
        </p>
      ) : helperText ? (
        <p id={helpId} className="text-sm text-ink-soft">
          {helperText}
        </p>
      ) : null}
    </div>
  )
})
