import { useEffect, useState } from 'react'
import { api, type DbHelpline } from '../../lib/api'

export const FALLBACK_HELPLINES: DbHelpline[] = [
  {
    name: 'Tele-MANAS (Govt of India)',
    numbers: ['14416', '1800-891-4416'],
    hours: '24x7',
  },
  {
    name: 'Vandrevala Foundation',
    numbers: ['1860-2662-345', '1800-2333-330'],
    hours: '24x7',
  },
  {
    name: 'iCall (TISS)',
    numbers: ['9152987821'],
    hours: 'Mon–Sat 8am–10pm',
  },
  {
    name: 'AASRA',
    numbers: ['9820466726'],
    hours: '24x7',
  },
]

export function useHelplines() {
  const [helplines, setHelplines] = useState<DbHelpline[]>(FALLBACK_HELPLINES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown | null>(null)

  useEffect(() => {
    let active = true

    api
      .getHelplines()
      .then((res) => {
        if (!active) return
        if (res && res.helplines && res.helplines.length > 0) {
          setHelplines(res.helplines)
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        console.warn('Failed to fetch helplines from API, using fallback:', err)
        setError(err)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return { helplines, loading, error }
}
