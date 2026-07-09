import { CalendarDays, House, ListChecks, Settings, User } from 'lucide-react'
import type { NavItem } from '../layout/DashboardLayout'
import {
  ROUTE_CALENDAR,
  ROUTE_DASHBOARD,
  ROUTE_PROFILE,
  ROUTE_SETTINGS,
  ROUTE_TRACKER,
} from './routes'

/** The five seeker sections, used by both the sidebar and the mobile dock. */
export const SEEKER_NAV: NavItem[] = [
  { label: 'Home', icon: House, route: ROUTE_DASHBOARD, end: true },
  { label: 'Calendar', icon: CalendarDays, route: ROUTE_CALENDAR },
  { label: 'Tracker', icon: ListChecks, route: ROUTE_TRACKER },
  { label: 'Settings', icon: Settings, route: ROUTE_SETTINGS },
  { label: 'Profile', icon: User, route: ROUTE_PROFILE },
]
