import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Ear, LineChart, MessageCircle, UserCheck } from 'lucide-react'
import { LinkButton } from '../components/ui'
import { Logo } from '../components/Logo'
import { TextLoop } from '../components/core/text-loop'
import { useHelplines } from '../components/safety/useHelplines'
import { LenisProvider } from '../motion/LenisProvider'
import { scrollReveal, ScrollTrigger } from '../motion/gsap'
import { fadeUp, staggerChildren } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'

const STEPS = [
  {
    icon: MessageCircle,
    accent: 'bg-accent-sage',
    title: 'Start a session',
    body: 'Talk to your AI companion, anytime. No appointment, no waiting room.',
  },
  {
    icon: Ear,
    accent: 'bg-accent-sky',
    title: 'Be heard',
    body: 'Share what’s on your mind. It listens, calmly, at your pace.',
  },
  {
    icon: UserCheck,
    accent: 'bg-accent-lavender',
    title: 'Get matched',
    body: 'If a professional would help, we connect you with a verified therapist, booked in the app.',
  },
  {
    icon: LineChart,
    accent: 'bg-accent-apricot',
    title: 'Track your progress',
    body: 'Follow the care plan your therapist sets, and see how far you’ve come.',
  },
]

const LOOP_WORDS = ['be heard', 'untangle a thought', 'breathe', 'start again']

function WelcomeHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
      <Link to="/" aria-label="Hovio home" className="focus-ring rounded-sm">
        <Logo />
      </Link>
      <nav className="flex items-center gap-2 sm:gap-3">
        <LinkButton to="/login" variant="ghost" size="sm">
          Log in
        </LinkButton>
        <LinkButton to="/register" variant="primary" size="sm">
          Get started
        </LinkButton>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-14 text-center sm:px-8 sm:pt-24">
      {/* Soft forest glow behind the headline — atmosphere, not decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-20 mx-auto h-[24rem] max-w-2xl rounded-full bg-[radial-gradient(closest-side,rgba(28,92,50,0.08),transparent)]"
      />

      <motion.div
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
        className="relative"
      >
        <motion.p
          variants={fadeUp}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-forest/15 bg-forest-tint/50 px-4 py-1.5 text-sm text-forest-deep"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-forest"
          />
          A quiet space to{' '}
          <TextLoop interval={3} className="font-medium">
            {LOOP_WORDS.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </TextLoop>
        </motion.p>

        <motion.h1
          variants={fadeUp}
          className="mt-6 font-display text-4xl leading-[1.08] text-ink sm:text-5xl lg:text-[4.25rem]"
        >
          A <em className="text-forest">calm</em> place to talk
          <br className="hidden sm:block" /> things through.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-6 max-w-xl text-lg text-ink-soft"
        >
          Hovio gives you a warm AI companion that listens, anytime — and
          connects you with a verified human therapist whenever you need one.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <LinkButton to="/register" size="lg" className="w-full sm:w-auto">
            Get started
          </LinkButton>
          <LinkButton
            to="/login"
            variant="ghost"
            size="lg"
            className="w-full sm:w-auto"
          >
            I already have an account
          </LinkButton>
        </motion.div>

        <motion.p variants={fadeUp} className="mt-5 text-xs text-ink-soft">
          For ages 18 and over. Your companion is a supportive listener, not a
          medical professional.
        </motion.p>
      </motion.div>
    </section>
  )
}

const TRUST_ITEMS = [
  'Private by design',
  'Verified human therapists',
  'Crisis support built in',
]

function TrustStrip() {
  return (
    <section
      aria-label="What you can count on"
      className="mx-auto w-full max-w-3xl px-5 sm:px-8"
    >
      <div className="flex flex-col items-center justify-center gap-2 border-y border-line py-5 text-sm text-ink-soft sm:flex-row sm:gap-0">
        {TRUST_ITEMS.map((item, i) => (
          <span key={item} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className="mx-4 hidden h-1 w-1 rounded-full bg-forest/30 sm:block"
              />
            )}
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}

function StepsSection() {
  const reduced = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const items = root.querySelectorAll<HTMLElement>('[data-reveal]')
    // Trigger off the container (a NodeList is not a valid trigger).
    const dispose = scrollReveal(items, {
      trigger: root,
      reducedMotion: reduced,
    })
    // Recalculate positions once fonts/layout settle (Lenis integration lives
    // in LenisProvider, which keeps ScrollTrigger updated while scrolling).
    const raf = requestAnimationFrame(() => ScrollTrigger.refresh())
    return () => {
      cancelAnimationFrame(raf)
      dispose()
    }
  }, [reduced])

  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8">
      <h2 className="text-center font-display text-3xl text-ink">
        How Hovio works
      </h2>
      <p className="mt-2 text-center font-display text-lg italic text-ink-soft">
        Four gentle steps, at your pace.
      </p>
      <div
        ref={containerRef}
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <div
              key={step.title}
              data-reveal
              className="group rounded-lg border border-line bg-paper p-6 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="flex items-start justify-between">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-forest ${step.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  aria-hidden
                  className="font-display text-2xl text-forest/25 transition-colors duration-300 group-hover:text-forest/50"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-medium text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function WelcomeFooter() {
  const { helplines } = useHelplines()
  const primary = helplines[0] || {
    name: 'Tele-MANAS',
    numbers: ['14416'],
    hours: '24x7',
  }
  const number = primary.numbers[0] || '14416'
  const telHref = `tel:${number.replace(/[^\d+]/g, '')}`

  return (
    <footer className="border-t border-line bg-cream">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Logo />
            <p className="max-w-xs text-sm text-ink-soft">
              A calm place to talk things through, with people ready to help.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm" aria-label="Footer">
            <a
              href="https://tryhovio.com"
              className="focus-ring rounded-sm text-ink-soft hover:text-ink"
            >
              About Hovio
            </a>
            <Link
              to="/privacy"
              className="focus-ring rounded-sm text-ink-soft hover:text-ink"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="focus-ring rounded-sm text-ink-soft hover:text-ink"
            >
              Terms
            </Link>
            <a
              href="mailto:support@hovio.org"
              className="focus-ring rounded-sm text-ink-soft hover:text-ink"
            >
              Contact & grievances
            </a>
          </nav>
        </div>

        {/* Dynamic crisis line using the resilient helplines hook */}
        <div className="mt-8 rounded-lg border border-forest/15 bg-forest-tint/40 px-4 py-3 text-sm text-forest-deep">
          If you or someone you know is in crisis, call{' '}
          <a
            href={telHref}
            className="focus-ring rounded-sm font-semibold underline underline-offset-2"
          >
            {primary.name} {number}
          </a>{' '}
          (free, {primary.hours}).
        </div>

        <p className="mt-6 text-xs text-ink-soft">
          © {new Date().getFullYear()} Hovio. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

export default function Welcome() {
  return (
    <LenisProvider enabled>
      <div className="min-h-svh w-full overflow-x-hidden bg-cream text-ink">
        <WelcomeHeader />
        <Hero />
        <TrustStrip />
        <StepsSection />
        <WelcomeFooter />
      </div>
    </LenisProvider>
  )
}
