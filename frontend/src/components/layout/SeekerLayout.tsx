import { Link, Outlet } from 'react-router-dom'
import { DashboardLayout } from './DashboardLayout'
import { Dock } from './Dock'
import { Logo } from '../Logo'
import { CrisisButton } from '../safety/CrisisButton'
import { SEEKER_NAV } from '../dashboard/nav'
import { ROUTE_DASHBOARD } from '../dashboard/routes'

/**
 * The seeker dashboard shell: sidebar on ≥lg, magnifying dock on mobile, with a
 * mobile header that keeps the crisis affordance reachable. Renders the active
 * section via <Outlet/>.
 */
export function SeekerLayout() {
  return (
    <DashboardLayout
      navItems={SEEKER_NAV}
      mobileHeader={
        <>
          <Link
            to={ROUTE_DASHBOARD}
            aria-label="Home"
            className="focus-ring rounded-sm"
          >
            <Logo />
          </Link>
          <CrisisButton variant="inline" />
        </>
      }
      renderMobileNav={() => <Dock items={SEEKER_NAV} />}
    >
      <Outlet />
    </DashboardLayout>
  )
}
