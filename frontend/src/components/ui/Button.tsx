import { forwardRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { pressScale, pressTransition } from '../../motion/presets'
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from './button-variants'
import { Spinner } from './Spinner'

export interface ButtonProps extends Omit<
  HTMLMotionProps<'button'>,
  'children'
> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading
    return (
      <motion.button
        ref={ref}
        type={props.type ?? 'button'}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        whileTap={isDisabled ? undefined : pressScale}
        transition={pressTransition}
        className={buttonClasses({ variant, size, className })}
        {...props}
      >
        {loading && <Spinner className="h-4 w-4" />}
        {children}
      </motion.button>
    )
  },
)
