import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Inbox, Sparkles } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  MessageBubble,
  Select,
  Sheet,
  Skeleton,
  Spinner,
  Tabs,
  Textarea,
  useToast,
} from '../components/ui'
import { CrisisButton } from '../components/safety/CrisisButton'
import { fadeUp, staggerChildren } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b border-line py-10">
      <h2 className="font-display text-3xl text-ink">{title}</h2>
      {children}
    </section>
  )
}

const COLORS: { label: string; className: string; dark?: boolean }[] = [
  { label: 'forest', className: 'bg-forest', dark: true },
  { label: 'forest-deep', className: 'bg-forest-deep', dark: true },
  { label: 'forest-tint', className: 'bg-forest-tint' },
  { label: 'cream', className: 'bg-cream' },
  { label: 'paper', className: 'bg-paper' },
  { label: 'ink', className: 'bg-ink', dark: true },
  { label: 'ink-soft', className: 'bg-ink-soft', dark: true },
  { label: 'line', className: 'bg-line' },
  { label: 'warning', className: 'bg-warning', dark: true },
  { label: 'danger', className: 'bg-danger', dark: true },
]

// Literal class strings so Tailwind's JIT detects each shade.
const FOREST_SCALE: { step: number; className: string }[] = [
  { step: 50, className: 'bg-forest-50' },
  { step: 100, className: 'bg-forest-100' },
  { step: 200, className: 'bg-forest-200' },
  { step: 300, className: 'bg-forest-300' },
  { step: 400, className: 'bg-forest-400' },
  { step: 500, className: 'bg-forest-500' },
  { step: 600, className: 'bg-forest-600' },
  { step: 700, className: 'bg-forest-700' },
  { step: 800, className: 'bg-forest-800' },
  { step: 900, className: 'bg-forest-900' },
]

const TYPE_SCALE: { cls: string; label: string }[] = [
  { cls: 'text-5xl', label: '3.5rem' },
  { cls: 'text-4xl', label: '2.75rem' },
  { cls: 'text-3xl', label: '2rem' },
  { cls: 'text-2xl', label: '1.5rem' },
  { cls: 'text-xl', label: '1.25rem' },
  { cls: 'text-lg', label: '1.125rem' },
  { cls: 'text-base', label: '1rem' },
  { cls: 'text-sm', label: '0.875rem' },
  { cls: 'text-xs', label: '0.75rem' },
]

function MotionSample() {
  const [key, setKey] = useState(0)
  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setKey((k) => k + 1)}
      >
        <Sparkles className="h-4 w-4" /> Replay
      </Button>
      <motion.ul
        key={key}
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
        className="grid gap-2 sm:grid-cols-3"
      >
        {['Calm', 'Spacious', 'Unhurried'].map((word) => (
          <motion.li
            key={word}
            variants={fadeUp}
            className="rounded-lg border border-line bg-paper px-4 py-6 text-center text-ink"
          >
            {word}
          </motion.li>
        ))}
      </motion.ul>
    </div>
  )
}

function ToastDemo() {
  const { toast } = useToast()
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        onClick={() => toast({ title: 'Saved', tone: 'success' })}
      >
        Success toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            title: 'Heads up',
            description: 'Your session will resume where you left off.',
            tone: 'info',
          })
        }
      >
        Info toast
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast({ title: 'Couldn’t connect', tone: 'warning' })}
      >
        Warning toast
      </Button>
    </div>
  )
}

export default function Styleguide() {
  const reduced = useReducedMotion()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <header className="space-y-2 pb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-forest">
          Dev only
        </p>
        <h1 className="font-display text-5xl text-ink">Hovio design system</h1>
        <p className="max-w-prose text-ink-soft">
          Every primitive, variant, and token on one page. Instrument Serif for
          display, Inter for everything else, forest on cream.
        </p>
        <p className="text-sm text-ink-soft">
          Reduced motion preference:{' '}
          <Badge tone={reduced ? 'warning' : 'forest'}>
            {reduced ? 'on — animations minimized' : 'off'}
          </Badge>
        </p>
        <Link
          to="/styleguide/dashboard"
          className="focus-ring inline-block rounded-sm text-sm font-medium text-forest underline underline-offset-4"
        >
          View DashboardLayout demo →
        </Link>
      </header>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COLORS.map((c) => (
            <div key={c.label} className="space-y-1">
              <div
                className={`h-16 rounded-lg border border-line ${c.className}`}
              />
              <p className="text-xs text-ink-soft">{c.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm text-ink-soft">forest 50–900</p>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {FOREST_SCALE.map((shade) => (
              <div
                key={shade.step}
                className={`h-12 flex-1 ${shade.className}`}
                title={`forest-${shade.step}`}
              />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Type scale">
        <div className="space-y-2">
          {TYPE_SCALE.map((t) => (
            <div key={t.cls} className="flex items-baseline gap-4">
              <span className="w-16 shrink-0 text-xs text-ink-soft">
                {t.label}
              </span>
              <span className={`font-display text-ink ${t.cls}`}>
                Hovio listens
              </span>
            </div>
          ))}
        </div>
        <p className="text-base text-ink-soft">
          Body copy uses Inter at a comfortable 1.6 line height. Sentence case
          everywhere; warm, calm, never clinical.
        </p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="quiet">Quiet</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Spinner />
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Name" placeholder="Ada Lovelace" />
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            helperText="We’ll only use this for sign-in."
          />
          <Input
            label="Phone"
            error="Enter a valid phone number."
            defaultValue="123"
          />
          <Select label="Preferred language" defaultValue="en">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="ta">Tamil</option>
          </Select>
          <Textarea
            label="What’s on your mind?"
            placeholder="Take your time…"
            className="sm:col-span-2"
          />
        </div>
      </Section>

      <Section title="Cards">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>A quiet space</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-ink-soft">
              Cards use a large radius, a hairline border, and a soft, low
              shadow — depth without noise.
            </p>
          </CardBody>
          <CardFooter>
            <Button size="sm">Continue</Button>
            <Button size="sm" variant="quiet">
              Not now
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Sheet & modal">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open sheet
          </Button>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
        </div>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Bottom sheet on mobile"
          description="Centered modal on ≥md. Focus is trapped; Esc closes."
          footer={
            <>
              <Button variant="quiet" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setSheetOpen(false)}>Got it</Button>
            </>
          }
        >
          <p className="text-ink-soft">
            Try tabbing through — focus stays inside. Press Esc or click the
            scrim to close.
          </p>
          <div className="mt-4">
            <Input label="A field to focus" placeholder="Tab to me" />
          </div>
        </Sheet>
        <Sheet
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Just checking"
          description="A simple confirmation."
          footer={<Button onClick={() => setModalOpen(false)}>Close</Button>}
        >
          <p className="text-ink-soft">Nothing destructive here.</p>
        </Sheet>
      </Section>

      <Section title="Tabs">
        <Tabs
          tabs={[
            {
              id: 'overview',
              label: 'Overview',
              content: (
                <p className="text-ink-soft">
                  Use arrow keys to move between tabs; the indicator animates.
                </p>
              ),
            },
            {
              id: 'activity',
              label: 'Activity',
              content: <p className="text-ink-soft">Recent activity panel.</p>,
            },
            {
              id: 'settings',
              label: 'Settings',
              content: <p className="text-ink-soft">Settings panel.</p>,
            },
          ]}
        />
      </Section>

      <Section title="Avatar, badges & toasts">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Ada Lovelace" size="sm" />
          <Avatar name="Grace Hopper" size="md" />
          <Avatar size="lg" />
          <Badge>Neutral</Badge>
          <Badge tone="forest">Verified</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Action needed</Badge>
        </div>
        <ToastDemo />
      </Section>

      <Section title="Empty state, skeleton & spinner">
        <Card>
          <EmptyState
            icon={Inbox}
            title="Nothing here yet"
            description="When you start a session, it’ll show up right here."
            action={<Button size="sm">Start a session</Button>}
          />
        </Card>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Section>

      <Section title="Message bubbles">
        <div className="space-y-3">
          <MessageBubble variant="assistant" timestamp="9:41 AM">
            Hi, I’m here to listen. What’s been on your mind lately?
          </MessageBubble>
          <MessageBubble variant="user" timestamp="9:42 AM">
            It’s been a heavy week. I’m not sure where to start.
          </MessageBubble>
          <MessageBubble variant="assistant" timestamp="9:42 AM">
            That’s okay — there’s no right place to begin. We can take it
            slowly.
          </MessageBubble>
        </div>
      </Section>

      <Section title="Crisis affordance">
        <p className="text-ink-soft">
          Calm, supportive, never alarmist. Opens the helpline sheet directly.
        </p>
        <CrisisButton />
      </Section>

      <Section title="Motion">
        <MotionSample />
      </Section>
    </div>
  )
}
