import { useState, type ReactNode } from 'react'
import { Button } from '../ui'
import { cn } from '../../lib/cn'
import { Reveal } from './reveal'
import { OUT_OF_SCOPE_CONDITIONS } from './config'
import { useHelplines } from '../safety/useHelplines'

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-line bg-paper p-4 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="focus-ring mt-0.5 h-4 w-4 rounded border-line accent-forest"
      />
      <span className="text-ink">{children}</span>
    </label>
  )
}

export function AgreementPanel({ onConfirm }: { onConfirm: () => void }) {
  const [age, setAge] = useState(false)
  const [docs, setDocs] = useState(false)
  const ready = age && docs

  return (
    <Reveal className="space-y-3">
      <CheckRow checked={age} onChange={setAge}>
        I confirm I’m 18 years of age or older.
      </CheckRow>
      <CheckRow checked={docs} onChange={setDocs}>
        I agree to Hovio’s{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-forest underline underline-offset-2"
        >
          Terms &amp; Conditions
        </a>{' '}
        and{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-forest underline underline-offset-2"
        >
          Privacy Policy
        </a>
        .
      </CheckRow>
      <p className="rounded-lg bg-forest-tint/40 px-4 py-3 text-sm text-ink-soft">
        A gentle reminder: Hovio’s AI companion offers everyday emotional
        support. It is not a medical service, and not a substitute for
        professional care or emergency help.
      </p>
      <Button onClick={onConfirm} disabled={!ready}>
        I agree
      </Button>
    </Reveal>
  )
}

export interface ConsentResult {
  ai_memory: boolean
  notifications_whatsapp: boolean
  notifications_email: boolean
  whatsapp_number?: string
}

export function ConsentPanel({
  onConfirm,
}: {
  onConfirm: (result: ConsentResult) => void
}) {
  const [dataProcessing, setDataProcessing] = useState(false)
  const [aiMemory, setAiMemory] = useState(false)
  const [whatsapp, setWhatsapp] = useState(false)
  const [email, setEmail] = useState(false)
  const [number, setNumber] = useState('')

  const ready = dataProcessing && (!whatsapp || number.trim().length > 0)

  return (
    <Reveal className="space-y-3">
      <CheckRow checked={dataProcessing} onChange={setDataProcessing}>
        <span className="font-medium">Data processing (required).</span> I allow
        Hovio to process my information to provide the service.
      </CheckRow>
      <CheckRow checked={aiMemory} onChange={setAiMemory}>
        <span className="font-medium">Remember our conversations.</span> Let the
        AI companion keep a private memory across sessions. You can turn this
        off anytime. (Off by default.)
      </CheckRow>
      <CheckRow checked={whatsapp} onChange={setWhatsapp}>
        <span className="font-medium">WhatsApp reminders.</span> Booking
        confirmations and reminders on WhatsApp.
      </CheckRow>
      {whatsapp && (
        <div className="space-y-1.5 pl-1">
          <input
            type="tel"
            inputMode="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Your WhatsApp number"
            className="focus-ring h-11 w-full rounded-md border border-line bg-paper px-3.5 text-ink placeholder:text-ink-soft/60"
          />
          <p className="text-xs text-ink-soft">
            Used only for confirmations and reminders — never for marketing.
          </p>
        </div>
      )}
      <CheckRow checked={email} onChange={setEmail}>
        <span className="font-medium">Email updates.</span> The same reminders
        by email.
      </CheckRow>
      <Button
        onClick={() =>
          onConfirm({
            ai_memory: aiMemory,
            notifications_whatsapp: whatsapp,
            notifications_email: email,
            whatsapp_number: whatsapp ? number.trim() : undefined,
          })
        }
        disabled={!ready}
      >
        Save preferences
      </Button>
    </Reveal>
  )
}

export function SuitabilityPanel({
  onChoose,
  submitting,
  error,
}: {
  onChoose: (noneApply: boolean) => void
  submitting: boolean
  error: string | null
}) {
  return (
    <Reveal className="space-y-4">
      <p className="text-sm text-ink-soft">
        Hovio’s companion and online sessions support everyday wellbeing and
        common concerns. They’re not designed for conditions that need
        psychiatric (medical) care, and they’re not crisis services.
      </p>
      <ul className="space-y-2">
        {OUT_OF_SCOPE_CONDITIONS.map((c) => (
          <li
            key={c}
            className="flex gap-2 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink"
          >
            <span aria-hidden="true" className="text-ink-soft">
              •
            </span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium text-ink">
        To your knowledge, do any of these currently apply to you?
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => onChoose(true)}
          loading={submitting}
          disabled={submitting}
        >
          No, none apply
        </Button>
        <Button
          variant="secondary"
          onClick={() => onChoose(false)}
          disabled={submitting}
        >
          One or more applies to me
        </Button>
      </div>
    </Reveal>
  )
}

/** Dynamic crisis line pulling from app_config helplines. */
export function CrisisLine({ className }: { className?: string }) {
  const { helplines } = useHelplines()
  const primary = helplines[0] || {
    name: 'Tele-MANAS',
    numbers: ['14416'],
    hours: '24x7',
  }
  const number = primary.numbers[0] || '14416'
  const telHref = `tel:${number.replace(/[^\d+]/g, '')}`

  return (
    <p
      className={cn(
        'rounded-lg border border-forest/15 bg-forest-tint/40 px-4 py-3 text-sm text-forest-deep',
        className,
      )}
    >
      If you’re in crisis or thinking about harming yourself, please reach out
      now: call{' '}
      <a href={telHref} className="font-semibold underline underline-offset-2">
        {primary.name} {number}
      </a>{' '}
      (free, {primary.hours}).
    </p>
  )
}
