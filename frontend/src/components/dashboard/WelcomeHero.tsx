import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { pressScale, pressTransition } from '../../motion/presets'
import { ROUTE_START } from './routes'
import { TextLoop } from '../core/text-loop'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Personalized welcome + the page's primary focal action. */
export function WelcomeHero() {
  const { me } = useAuth()
  const name = me?.display_name?.trim() || 'there'

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-forest-deep/10 px-8 py-10 shadow-soft sm:px-12 sm:py-14 min-h-[280px] flex items-center bg-cover bg-center bg-no-repeat bg-forest-deep"
      style={{ backgroundImage: 'url("/hero_bg.png?v=2")' }}
    >
      {/* Subtle dark overlay to ensure text legibility */}
      <div className="absolute inset-0 bg-forest-deep/30" aria-hidden="true" />

      {/* Text Content */}
      <div className="max-w-xl w-full relative z-10 space-y-4">
        <div className="space-y-3">
          {/* AI companion badge — glassmorphism pill */}
          <div className="inline-flex items-center gap-2 rounded-full bg-cream/10 border border-cream/20 backdrop-blur-sm px-3.5 py-1.5 text-xs font-medium text-cream/90 select-none">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Your AI companion is here</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-cream leading-tight font-normal">
            {greeting()}, <br />
            <span className="italic">{name}</span>
          </h1>

          <div className="text-base sm:text-lg text-cream/85 leading-relaxed font-normal min-h-[1.75rem] overflow-hidden">
            <TextLoop interval={4} className="text-cream/90">
              <span>Whenever you're ready, I'm here to listen.</span>
              <span>Take a breath and begin when you like.</span>
              <span>Share whatever is on your mind today.</span>
              <span>I'm here to support you, step by step.</span>
            </TextLoop>
          </div>
        </div>

        {/* CTA — cream pill with circular arrow icon, matching "Get in Touch" reference */}
        <div className="pt-2">
          <motion.div
            whileTap={pressScale}
            transition={pressTransition}
            className="inline-block"
          >
            <Link
              to={ROUTE_START}
              className="inline-flex h-12 items-center gap-3 rounded-full bg-cream px-6 text-sm font-medium text-forest shadow-md transition-all hover:bg-forest-tint hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-cream focus:ring-offset-2 focus:ring-offset-forest"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest/15">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
              Start a session
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
