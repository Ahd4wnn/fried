import { Link, type LinkProps } from 'react-router-dom'
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from './button-variants'

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
}

/** A react-router Link styled exactly like a Button. */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: LinkButtonProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props} />
  )
}
