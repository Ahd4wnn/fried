import { Link } from 'react-router-dom'
import { ArrowRight, UserCog } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { ROUTE_PROFILE } from './routes'

/**
 * Gentle nudge shown only when a profile field is missing. Hidden when complete.
 * For now it keys off the display name; later prompts can add more checks.
 */
export function ProfileNudge() {
  const { me } = useAuth()
  const incomplete = !me?.display_name?.trim()
  if (!incomplete) return null

  return (
    <Link
      to={ROUTE_PROFILE}
      className="focus-ring group flex items-center gap-4 rounded-2xl border border-[#E1A7B5]/30 bg-[#F8DEE4]/40 px-5 py-4 transition-all hover:bg-[#F8DEE4]/70 hover:shadow-soft text-left"
    >
      {/* Colored circular icon badge — blush/pink for warmth */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E1A7B5]/30 text-[#B5607A] shadow-soft">
        <UserCog className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink leading-tight">
          Finish setting up your profile
        </span>
        <span className="block text-xs text-ink-soft mt-1 leading-normal">
          Add your name so we can make Hovio feel like yours.
        </span>
      </span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/8 text-ink/60 group-hover:bg-ink/14 transition-colors">
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}
