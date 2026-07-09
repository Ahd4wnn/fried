import { createContext, useContext } from 'react'
import type Lenis from 'lenis'

export interface LenisContextValue {
  /** The live Lenis instance, or null when smooth scroll is off. */
  lenis: Lenis | null
}

export const LenisContext = createContext<LenisContextValue>({ lenis: null })

/** Access the active Lenis instance (null on dashboard/chat or reduced motion). */
export function useLenis(): Lenis | null {
  return useContext(LenisContext).lenis
}
