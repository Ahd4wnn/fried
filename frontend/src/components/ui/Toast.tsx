import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { sheetSpring } from '../../motion/presets'
import {
  ToastContext,
  type ToastOptions,
  type ToastTone,
} from './toast-context'

interface ToastItem extends Required<Omit<ToastOptions, 'description'>> {
  id: number
  description?: string
}

const toneConfig: Record<
  ToastTone,
  { Icon: typeof Info | null; iconClass: string }
> = {
  default: { Icon: null, iconClass: '' },
  success: { Icon: Check, iconClass: 'text-forest' },
  info: { Icon: Info, iconClass: 'text-forest' },
  warning: { Icon: TriangleAlert, iconClass: 'text-warning' },
  danger: { Icon: CircleAlert, iconClass: 'text-danger' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    ({
      title,
      description,
      tone = 'default',
      duration = 4000,
    }: ToastOptions) => {
      const id = ++idRef.current
      setToasts((prev) => [...prev, { id, title, description, tone, duration }])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end"
            role="region"
            aria-label="Notifications"
          >
            <AnimatePresence initial={false}>
              {toasts.map((t) => {
                const { Icon, iconClass } = toneConfig[t.tone]
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={sheetSpring}
                    role="status"
                    aria-live="polite"
                    className="pointer-events-auto flex w-[min(22rem,90vw)] items-start gap-3 rounded-lg border border-line bg-paper p-4 shadow-soft"
                  >
                    {Icon && (
                      <Icon
                        aria-hidden="true"
                        className={cn('mt-0.5 h-5 w-5 shrink-0', iconClass)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{t.title}</p>
                      {t.description && (
                        <p className="mt-1 text-sm text-ink-soft">
                          {t.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(t.id)}
                      aria-label="Dismiss notification"
                      className="focus-ring -m-1 rounded-md p-1 text-ink-soft transition-colors hover:text-ink"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
