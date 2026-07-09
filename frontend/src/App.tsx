import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import {
  ProtectedRoute,
  PublicOnlyRoute,
  SeekerGuard,
  TherapistGuard,
  AdminGuard,
} from './routes/guards'
import { FullScreenLoader } from './components/FullScreenLoader'

// Every page is code-split so each route loads only what it needs. In
// particular this keeps GSAP + Lenis (used only by the welcome page) out of the
// bundle that /login and /register depend on.
const Welcome = lazy(() => import('./pages/Welcome'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const NotFound = lazy(() => import('./pages/NotFound'))
const TherapistDashboard = lazy(() => import('./pages/therapist/Dashboard'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const PrivacyPage = lazy(() =>
  import('./pages/LegalPage').then((m) => ({ default: m.PrivacyPage })),
)
const TermsPage = lazy(() =>
  import('./pages/LegalPage').then((m) => ({ default: m.TermsPage })),
)

// Seeker dashboard
const SeekerLayout = lazy(() =>
  import('./components/layout/SeekerLayout').then((m) => ({
    default: m.SeekerLayout,
  })),
)
const DashboardHome = lazy(() => import('./pages/dashboard/Home'))
const Therapists = lazy(() => import('./pages/Therapists'))
const CalendarSection = lazy(() =>
  import('./pages/dashboard/placeholders').then((m) => ({
    default: m.CalendarSection,
  })),
)
const TrackerSection = lazy(() =>
  import('./pages/dashboard/placeholders').then((m) => ({
    default: m.TrackerSection,
  })),
)
const SettingsSection = lazy(() =>
  import('./pages/dashboard/placeholders').then((m) => ({
    default: m.SettingsSection,
  })),
)
const ProfileSection = lazy(() =>
  import('./pages/dashboard/placeholders').then((m) => ({
    default: m.ProfileSection,
  })),
)
const StartSession = lazy(() => import('./pages/dashboard/ChatSession'))

// Dev-only styleguide — never linked from production nav.
const Styleguide = lazy(() => import('./pages/Styleguide'))
const DashboardDemo = lazy(() => import('./pages/DashboardDemo'))

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Welcome />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        {/* Standalone: reachable during the password-recovery session. */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Public-only (redirect signed-in users onward) */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        {/* Authenticated + role-assigned */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
        </Route>

        {/* Seeker dashboard (authenticated + seeker + onboarded) */}
        <Route element={<SeekerGuard />}>
          <Route element={<SeekerLayout />}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/dashboard/calendar" element={<CalendarSection />} />
            <Route path="/dashboard/tracker" element={<TrackerSection />} />
            <Route path="/dashboard/settings" element={<SettingsSection />} />
            <Route path="/dashboard/profile" element={<ProfileSection />} />
            <Route path="/dashboard/session" element={<StartSession />} />
            <Route path="/therapists" element={<Therapists />} />
          </Route>
        </Route>

        {/* Therapist dashboard (authenticated + therapist + onboarded) */}
        <Route element={<TherapistGuard />}>
          <Route path="/therapist/dashboard" element={<TherapistDashboard />} />
        </Route>

        {/* Admin dashboard (authenticated + admin) */}
        <Route element={<AdminGuard />}>
          <Route path="/admin/dashboard" element={<AdminDashboard tab="overview" />} />
          <Route path="/admin/dashboard/verifications" element={<AdminDashboard tab="verifications" />} />
          <Route path="/admin/dashboard/reports" element={<AdminDashboard tab="reports" />} />
          <Route path="/admin/dashboard/users" element={<AdminDashboard tab="users" />} />
          <Route path="/admin/dashboard/crisis" element={<AdminDashboard tab="crisis" />} />
          <Route path="/admin/dashboard/payments" element={<AdminDashboard tab="payments" />} />
        </Route>

        {import.meta.env.DEV && (
          <>
            <Route path="/styleguide" element={<Styleguide />} />
            <Route path="/styleguide/dashboard/*" element={<DashboardDemo />} />
          </>
        )}

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
