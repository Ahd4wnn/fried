import { createContext, useContext } from 'react'

export type ToastTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

export interface ToastOptions {
  title: string
  description?: string
  tone?: ToastTone
  /** Auto-dismiss delay in ms. Set 0 to require manual dismiss. */
  duration?: number
}

export interface ToastContextValue {
  toast: (options: ToastOptions) => number
  dismiss: (id: number) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** Fire non-blocking toasts. Must be used within <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
