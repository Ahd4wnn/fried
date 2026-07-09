import { Reveal } from './reveal'
import { CrisisLine } from './panels'
import { Button } from '../ui'

/** Shown when the seeker is under 18 — caring, not a rejection. */
export function UnderageOffRamp({ onExit }: { onExit: () => void }) {
  return (
    <Reveal className="space-y-4">
      <h2 className="font-display text-2xl text-ink">
        Thank you for being here
      </h2>
      <p className="text-ink-soft">
        Hovio is built for adults aged 18 and over, so we’re not able to
        continue right now. That doesn’t mean support isn’t out there — it very
        much is.
      </p>
      <p className="text-ink-soft">
        If you’re a young person looking for someone to talk to, you deserve
        care that’s right for you. Please consider reaching out to a trusted
        adult, a school counsellor, or one of the helplines below.
      </p>
      <CrisisLine />
      <Button variant="secondary" onClick={onExit}>
        Back to sign in
      </Button>
    </Reveal>
  )
}

/**
 * Shown when the seeker indicates an out-of-scope condition. A caring guide to
 * better-fit care, not a rejection. Onboarding is not completed.
 */
export function SuitabilityOffRamp({ onExit }: { onExit: () => void }) {
  return (
    <Reveal className="space-y-4">
      <h2 className="font-display text-2xl text-ink">
        Let’s find you the right kind of care
      </h2>
      <p className="text-ink-soft">
        Thank you for being honest — that takes courage. From what you’ve
        shared, Hovio isn’t the right fit for what you need right now. You
        deserve support from someone qualified for it, and here’s how to find
        it.
      </p>
      <ul className="space-y-2 text-sm text-ink">
        <li className="rounded-lg border border-line bg-paper px-4 py-3">
          <span className="font-medium">See a psychiatrist or doctor.</span> For
          conditions that may need medical treatment or medication, a
          psychiatrist can assess and guide you. Your GP can refer you.
        </li>
        <li className="rounded-lg border border-line bg-paper px-4 py-3">
          <span className="font-medium">Consider in-person care.</span> A local
          mental-health clinic or hospital can offer the kind of ongoing,
          face-to-face support that’s right here.
        </li>
      </ul>
      <CrisisLine />
      <p className="text-sm text-ink-soft">
        If you’d like a hand finding care, reach us at{' '}
        <a
          href="mailto:support@hovio.org"
          className="font-medium text-forest underline underline-offset-2"
        >
          support@hovio.org
        </a>
        .
      </p>
      <Button variant="secondary" onClick={onExit}>
        Back to sign in
      </Button>
    </Reveal>
  )
}

/**
 * Shown when Hovio is not yet available in the seeker's location.
 * Records the demand, blocks app access, and shows localized crisis warning.
 */
export function UnavailableOffRamp({ onExit }: { onExit: () => void }) {
  return (
    <Reveal className="space-y-4">
      <h2 className="font-display text-2xl text-ink">
        Hovio isn’t available in your country yet
      </h2>
      <p className="text-ink-soft">
        We’ve noted your interest and we’ll be in touch as we expand. Thank you
        for wanting to be a part of Hovio.
      </p>
      <div className="rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
        <span className="font-medium text-ink">Please note:</span> The emergency
        and crisis resources provided on this platform are currently specific to
        India.
      </div>
      <CrisisLine />
      <Button variant="secondary" onClick={onExit}>
        Back to sign in
      </Button>
    </Reveal>
  )
}
