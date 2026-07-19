// Minimal typings + loader for Razorpay Checkout (checkout.js).
// Only the fields Hovio uses — see https://razorpay.com/docs/checkout/

export interface RazorpayCheckoutResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export interface RazorpayFailedResponse {
  error: { description?: string }
}

export interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill: { name: string; email: string }
  theme: { color: string }
  handler: (response: RazorpayCheckoutResponse) => void
  modal?: { ondismiss?: () => void }
}

export interface RazorpayInstance {
  open: () => void
  on: (event: 'payment.failed', cb: (resp: RazorpayFailedResponse) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

/** Load checkout.js once; resolves false if the script fails to load. */
export function loadRazorpay(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}
