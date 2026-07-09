import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { fieldBase } from './Input'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  helperText?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, helperText, error, id, className, ...props },
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
          <label htmlFor={fieldId} className="text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            fieldBase,
            'min-h-[6rem] resize-y py-2.5 leading-relaxed',
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
  },
)
