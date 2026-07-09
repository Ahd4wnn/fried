import { Link } from 'react-router-dom'
import { Calendar, House, ListChecks, Settings, User } from 'lucide-react'
import {
  DashboardLayout,
  type NavItem,
} from '../components/layout/DashboardLayout'
import { Card, CardBody, CardTitle } from '../components/ui'

// Placeholder nav for the demo only — the real seeker sections are wired in Prompt 5.
const DEMO_NAV: NavItem[] = [
  { label: 'Home', icon: House, route: '/styleguide/dashboard' },
  {
    label: 'Calendar',
    icon: Calendar,
    route: '/styleguide/dashboard/calendar',
  },
  {
    label: 'Tracker',
    icon: ListChecks,
    route: '/styleguide/dashboard/tracker',
  },
  {
    label: 'Settings',
    icon: Settings,
    route: '/styleguide/dashboard/settings',
  },
  { label: 'Profile', icon: User, route: '/styleguide/dashboard/profile' },
]

export default function DashboardDemo() {
  return (
    <DashboardLayout navItems={DEMO_NAV}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-4xl text-ink">Dashboard layout</h1>
          <p className="text-ink-soft">
            Sidebar on ≥lg, bottom tab bar on mobile. Resize the window to see
            it switch. The crisis affordance stays reachable on every screen.
          </p>
          <Link
            to="/styleguide"
            className="focus-ring inline-block rounded-sm text-sm font-medium text-forest underline underline-offset-4"
          >
            ← Back to styleguide
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {['Recent sessions', 'Upcoming', 'Your care plan', 'Notes'].map(
            (title) => (
              <Card key={title}>
                <CardBody className="space-y-2">
                  <CardTitle className="text-xl">{title}</CardTitle>
                  <p className="text-sm text-ink-soft">
                    Placeholder content for the layout demo.
                  </p>
                </CardBody>
              </Card>
            ),
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
