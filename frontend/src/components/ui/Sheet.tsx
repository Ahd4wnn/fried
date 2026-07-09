import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { sheetSpring } from '../../motion/presets'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  /** Hide the default close (X) button if the caller provides its own. */
  hideClose?: boolean
  className?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Accessible dialog. Bottom-sheet on mobile, centered modal on ≥md. Traps
 * focus, closes on Esc and scrim click, locks body scroll, and restores focus
 * to the previously focused element on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  hideClose,
  className,
}: SheetProps) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetPanel
          onClose={onClose}
          title={title}
          description={description}
          footer={footer}
          hideClose={hideClose}
          className={className}
        >
          {children}
        </SheetPanel>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function SheetPanel({
  onClose,
  title,
  description,
  children,
  footer,
  hideClose,
  className,
}: Omit<SheetProps, 'open'>) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current

    // Lock body scroll.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog.
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE)
    ;(focusables && focusables.length ? focusables[0] : panel)?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab' && panel) {
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.offsetParent !== null)
        if (items.length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      {/* Scrim */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
        aria-hidden="true"
      />
      {/* Panel */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={sheetSpring}
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden border border-line bg-paper shadow-soft outline-none',
          'rounded-t-xl md:w-[min(32rem,92vw)] md:rounded-xl',
          className,
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div className="min-w-0">
              {title && (
                <h2 id={titleId} className="font-display text-2xl text-ink">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-1 text-sm text-ink-soft">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="focus-ring -m-1 rounded-md p-1 text-ink-soft transition-colors hover:text-ink"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  )
}
