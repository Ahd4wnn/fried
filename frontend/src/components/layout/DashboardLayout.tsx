import type { ComponentType, ReactNode } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { CrisisButton } from '../safety/CrisisButton'
import { Logo } from '../Logo'
import { useAuth } from '../../auth/auth-context'
import { useReducedMotion } from '../../motion/useReducedMotion'
import { gsap } from '../../motion/gsap'

export interface NavItem {
  label: string
  icon: ComponentType<{ className?: string }>
  route: string
  /** Match the route exactly (use for index/home links). */
  end?: boolean
}

interface DashboardLayoutProps {
  navItems: NavItem[]
  children: ReactNode
  /** Optional brand/title shown in the sidebar header. */
  brand?: ReactNode
  /** Sticky top bar shown only on mobile (<lg). E.g. logo + crisis button. */
  mobileHeader?: ReactNode
  /**
   * Custom mobile bottom navigation (e.g. the magnifying dock). When provided,
   * it replaces the default tab bar and the default floating crisis button —
   * the caller is responsible for keeping crisis reachable (e.g. mobileHeader).
   */
  renderMobileNav?: () => ReactNode
  theme?: 'default' | 'admin-dark'
}

/**
 * Role-agnostic dashboard frame. Sidebar on ≥lg; on mobile either a custom nav
 * (the dock) or the default bottom tab bar. Content scrolls; the crisis
 * affordance is reachable on every screen.
 */
export function DashboardLayout({
  navItems,
  children,
  brand,
  mobileHeader,
  renderMobileNav,
  theme = 'default',
}: DashboardLayoutProps) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isChatRoute = location.pathname === '/dashboard/session'
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null)

  // Persist sidebar collapsed state to provide a seamless UX across navigations
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hovio_sidebar_collapsed')
      return saved === 'true'
    }
    return false
  })

  useEffect(() => {
    localStorage.setItem('hovio_sidebar_collapsed', String(isCollapsed))
  }, [isCollapsed])

  const customMobileNav = !!renderMobileNav

  useEffect(() => {
    if (reducedMotion) return
    const capsules = containerRef.current?.querySelectorAll('.sidebar-capsule')
    if (!capsules || capsules.length === 0) return

    // Staggered back-out bounce entrance for sidebar capsules
    const tween = gsap.fromTo(
      capsules,
      { opacity: 0, x: -30 },
      {
        opacity: 1,
        x: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'back.out(1.2)',
        clearProps: 'opacity,transform',
      },
    )

    return () => {
      tween.kill()
    }
  }, [reducedMotion])

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }

  // Partition navigation items to distinguish primary navigation from account details
  const mainItems = navItems.filter(
    (item) => item.label !== 'Profile' && item.label !== 'Settings',
  )
  const accountItems = navItems.filter(
    (item) => item.label === 'Profile' || item.label === 'Settings',
  )

  return (
    <div
      className={cn(
        "flex min-h-svh w-full overflow-x-hidden transition-colors duration-300 relative",
        theme === 'admin-dark' ? 'bg-[#090B0E] text-neutral-100' : 'bg-cream text-ink'
      )}
      style={
        isChatRoute
          ? {
              backgroundImage: `
                radial-gradient(circle at 1px 1px, rgba(44, 73, 58, 0.04) 1px, transparent 0),
                linear-gradient(to top right, #fbf8f5, #f7f0e8, #f0e7f7)
              `,
              backgroundSize: '24px 24px, 100% 100%',
            }
          : undefined
      }
    >
      {/* Background Mesh Glow Blobs for Admin Portal */}
      {theme === 'admin-dark' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
          <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-forest/10 blur-[150px]" />
          <div className="absolute top-1/2 -right-40 h-[500px] w-[500px] rounded-full bg-[#1C5C32]/8 blur-[130px]" />
          <div className="absolute -bottom-40 left-1/3 h-[600px] w-[600px] rounded-full bg-emerald-950/10 blur-[160px]" />
        </div>
      )}

      {/* Sidebar — ≥lg */}
      <motion.aside
        ref={containerRef}
        animate={{ width: isCollapsed ? 88 : 260 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 280, damping: 26 }
        }
        className={cn(
          'fixed top-0 left-0 bottom-0 hidden h-svh shrink-0 flex-col gap-4 lg:flex select-none z-30 transition-all duration-300',
          theme === 'admin-dark'
            ? 'bg-neutral-950/45 backdrop-blur-xl border-r border-white/5'
            : isChatRoute
            ? 'bg-transparent'
            : 'bg-cream',
          isCollapsed ? 'px-4 py-5' : 'p-5',
        )}
      >
        {/* Floating Edge Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'focus-ring absolute top-10 -right-3 z-40 flex h-7 w-7 items-center justify-center rounded-full border shadow-soft hover:scale-[1.05] transition-all cursor-pointer',
            theme === 'admin-dark'
              ? 'border-white/10 bg-neutral-900 text-white hover:bg-neutral-800'
              : 'border-forest-300/15 bg-paper text-forest hover:bg-forest-tint',
          )}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>

        {/* Logo Capsule */}
        <div
          className={cn(
            'sidebar-capsule flex items-center justify-center rounded-2xl border shadow-soft overflow-hidden w-full transition-all duration-200',
            theme === 'admin-dark'
              ? 'border-white/5 bg-white/[0.02] shadow-2xl backdrop-blur-md'
              : 'border-forest-300/15 bg-paper',
            isCollapsed ? 'h-14 p-2' : 'h-[80px] p-4',
          )}
        >
          <Link
            to={theme === 'admin-dark' ? '/admin/dashboard' : '/dashboard'}
            className="focus-ring rounded-md flex items-center justify-center"
          >
            {isCollapsed ? (
              <Logo variant={theme === 'admin-dark' ? 'white' : 'dark'} className="h-8 w-8 object-contain" />
            ) : (
              (brand ?? (
                <Logo variant={theme === 'admin-dark' ? 'white' : 'dark'} className="h-8 w-8 object-contain" />
              ))
            )}
          </Link>
        </div>

        {/* Navigation Capsule */}
        <div
          className={cn(
            'sidebar-capsule flex flex-1 flex-col justify-between rounded-2xl border p-3 shadow-soft overflow-hidden w-full',
            theme === 'admin-dark'
              ? 'border-white/5 bg-white/[0.02] shadow-2xl backdrop-blur-md'
              : 'border-forest-300/15 bg-paper',
          )}
        >
          <div className="space-y-6">
            {/* Main Navigation Group */}
            <div className="space-y-2">
              {!isCollapsed && (
                <span
                  className={cn(
                    'px-3 text-[10px] font-semibold tracking-wider uppercase',
                    theme === 'admin-dark' ? 'text-neutral-400/50' : 'text-ink-soft/60',
                  )}
                >
                  Main
                </span>
              )}
              <nav
                className={cn(
                  'space-y-1 w-full flex flex-col',
                  isCollapsed ? 'items-center' : '',
                )}
                aria-label="Primary"
              >
                {mainItems.map((item) => (
                  <SidebarLink
                    key={item.label}
                    item={item}
                    hoveredRoute={hoveredRoute}
                    setHoveredRoute={setHoveredRoute}
                    isCollapsed={isCollapsed}
                    theme={theme}
                  />
                ))}
              </nav>
            </div>

            {/* Account Group */}
            <div className="space-y-2">
              {!isCollapsed && (
                <span
                  className={cn(
                    'px-3 text-[10px] font-semibold tracking-wider uppercase',
                    theme === 'admin-dark' ? 'text-neutral-400/50' : 'text-ink-soft/60',
                  )}
                >
                  Account
                </span>
              )}
              <nav
                className={cn(
                  'space-y-1 w-full flex flex-col',
                  isCollapsed ? 'items-center' : '',
                )}
                aria-label="Account"
              >
                {accountItems.map((item) => (
                  <SidebarLink
                    key={item.label}
                    item={item}
                    hoveredRoute={hoveredRoute}
                    setHoveredRoute={setHoveredRoute}
                    isCollapsed={isCollapsed}
                    theme={theme}
                  />
                ))}
              </nav>
            </div>
          </div>

          {/* Sign Out Button at the bottom of Nav Capsule */}
          <div
            className={cn(
              'pt-3 border-t w-full flex justify-center',
              theme === 'admin-dark' ? 'border-white/5' : 'border-line/50',
            )}
          >
            <button
              onClick={handleSignOut}
              className={cn(
                'focus-ring group relative flex h-11 items-center rounded-xl text-sm font-medium transition-colors bg-transparent border-0 cursor-pointer text-left w-full',
                theme === 'admin-dark' ? 'text-neutral-400 hover:text-danger' : 'text-ink-soft hover:text-danger',
                isCollapsed ? 'justify-center px-0 w-11' : 'px-3 gap-3 w-full',
              )}
            >
              <LogOut
                className={cn(
                  'h-5 w-5 shrink-0 group-hover:text-danger group-hover:translate-x-0.5 transition-all',
                  theme === 'admin-dark' ? 'text-neutral-400/80' : 'text-ink-soft/80',
                )}
              />
              <motion.span
                animate={
                  reducedMotion
                    ? { opacity: isCollapsed ? 0 : 1 }
                    : {
                        opacity: isCollapsed ? 0 : 1,
                        width: isCollapsed ? 0 : 'auto',
                        marginLeft: isCollapsed ? 0 : 12,
                      }
                }
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="truncate whitespace-nowrap overflow-hidden font-sans"
              >
                Sign out
              </motion.span>
            </button>
          </div>
        </div>

        {/* Crisis Capsule */}
        <div
          className={cn(
            'sidebar-capsule rounded-2xl border shadow-soft flex justify-center w-full transition-all duration-200',
            theme === 'admin-dark'
              ? 'border-white/5 bg-white/[0.02] shadow-2xl backdrop-blur-md'
              : 'border-forest-300/15 bg-paper',
            isCollapsed ? 'h-14 p-2 items-center' : 'p-3',
          )}
        >
          <CrisisButton
            variant="inline"
            compact={isCollapsed}
            className="w-full"
          />
        </div>
      </motion.aside>

      {/* Spacer to push main content when sidebar is fixed */}
      <motion.div
        animate={{ width: isCollapsed ? 88 : 260 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 280, damping: 26 }
        }
        className="hidden lg:block shrink-0"
      />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col z-10">
        {mobileHeader && !isChatRoute && (
          <header
            className={cn(
              'sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur lg:hidden',
              theme === 'admin-dark'
                ? 'border-white/5 bg-neutral-950/85'
                : 'border-line bg-cream/90',
            )}
          >
            {mobileHeader}
          </header>
        )}
        <main
          className={cn(
            isChatRoute
              ? 'flex-1 flex flex-col min-h-0 overflow-hidden p-0'
              : cn(
                  'flex-1 overflow-y-auto px-5 pt-6 sm:px-8 lg:pb-10',
                  customMobileNav ? 'pb-32' : 'pb-24',
                ),
          )}
        >
          {children}
        </main>
      </div>

      {!isChatRoute &&
        (customMobileNav ? (
          renderMobileNav()
        ) : (
          <>
            {/* Default bottom tab bar — mobile */}
            <nav
              aria-label="Primary"
              className={cn(
                'fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t backdrop-blur lg:hidden',
                theme === 'admin-dark'
                  ? 'border-white/5 bg-[#090B0E]/95'
                  : 'border-line bg-paper/95',
              )}
            >
              {navItems.map((item) => (
                <TabBarLink key={item.label} item={item} theme={theme} />
              ))}
            </nav>
            {/* Crisis affordance — floating on mobile (sidebar hosts it on ≥lg) */}
            <CrisisButton variant="floating" className="bottom-20 lg:hidden" />
          </>
        ))}
    </div>
  )
}

interface SidebarLinkProps {
  item: NavItem
  hoveredRoute: string | null
  setHoveredRoute: (route: string | null) => void
  isCollapsed: boolean
  theme?: 'default' | 'admin-dark'
}

function SidebarLink({
  item,
  hoveredRoute,
  setHoveredRoute,
  isCollapsed,
  theme,
}: SidebarLinkProps) {
  const { icon: Icon, label, route, end } = item
  const reducedMotion = useReducedMotion()

  return (
    <NavLink
      to={route}
      end={end}
      onPointerEnter={() => setHoveredRoute(route)}
      onPointerLeave={() => setHoveredRoute(null)}
      className={cn(
        'focus-ring relative flex h-11 items-center transition-colors select-none',
        isCollapsed
          ? 'w-10 h-10 justify-center px-0 rounded-full'
          : 'w-full px-3 gap-3 rounded-xl',
      )}
    >
      {({ isActive }) => (
        <>
          {/* Active Highlight (sliding background) */}
          {isActive && !reducedMotion && (
            <motion.div
              layoutId="nav-active-pill"
              className={cn(
                theme === 'admin-dark' ? 'absolute inset-0 bg-forest/40 border border-forest/30 shadow-[0_0_12px_rgba(28,92,80,0.2)]' : 'absolute inset-0 bg-forest',
                isCollapsed ? 'rounded-full' : 'rounded-xl',
              )}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}

          {/* Hover Highlight (sliding background) */}
          {!isActive && hoveredRoute === route && !reducedMotion && (
            <motion.div
              layoutId="nav-hover-pill"
              className={cn(
                theme === 'admin-dark' ? 'absolute inset-0 bg-white/[0.03] border border-white/5' : 'absolute inset-0 bg-forest-tint/60',
                isCollapsed ? 'rounded-full' : 'rounded-xl',
              )}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            />
          )}

          {/* Static fallbacks for reduced-motion */}
          {reducedMotion && isActive && (
            <div
              className={cn(
                theme === 'admin-dark' ? 'absolute inset-0 bg-forest/40 border border-forest/30 shadow-[0_0_12px_rgba(28,92,80,0.2)]' : 'absolute inset-0 bg-forest',
                isCollapsed ? 'rounded-full' : 'rounded-xl',
              )}
            />
          )}
          {reducedMotion && !isActive && hoveredRoute === route && (
            <div
              className={cn(
                theme === 'admin-dark' ? 'absolute inset-0 bg-white/[0.03] border border-white/5' : 'absolute inset-0 bg-forest-tint/60',
                isCollapsed ? 'rounded-full' : 'rounded-xl',
              )}
            />
          )}

          {/* Content (Z-indexed above highlights) */}
          <span
            className={cn(
              'relative z-10 flex items-center transition-colors duration-200 w-full',
              isCollapsed ? 'justify-center' : '',
              isActive
                ? 'text-cream font-medium'
                : theme === 'admin-dark'
                ? 'text-neutral-400 hover:text-neutral-200'
                : 'text-ink-soft hover:text-ink',
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5 shrink-0 transition-colors',
                isActive
                  ? 'text-cream'
                  : theme === 'admin-dark'
                  ? 'text-neutral-400/80'
                  : 'text-ink-soft/80',
              )}
            />
            <motion.span
              animate={
                reducedMotion
                  ? { opacity: isCollapsed ? 0 : 1 }
                  : {
                      opacity: isCollapsed ? 0 : 1,
                      width: isCollapsed ? 0 : 'auto',
                      marginLeft: isCollapsed ? 0 : 12,
                    }
              }
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="truncate whitespace-nowrap overflow-hidden font-sans"
            >
              {label}
            </motion.span>
          </span>
        </>
      )}
    </NavLink>
  )
}

function TabBarLink({ item, theme }: { item: NavItem; theme?: 'default' | 'admin-dark' }) {
  const { icon: Icon, label, route, end } = item
  return (
    <NavLink
      to={route}
      end={end}
      className={({ isActive }) =>
        cn(
          'focus-ring flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors',
          isActive
            ? theme === 'admin-dark'
              ? 'text-white'
              : 'text-forest'
            : theme === 'admin-dark'
            ? 'text-neutral-400'
            : 'text-ink-soft',
        )
      }
    >
      <Icon className="h-5 w-5" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}
