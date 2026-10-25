import clsx from 'clsx';
import { CalendarClock, Ellipsis, House, IndianRupee, List, Plus, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigation } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { OfflineBanner } from '../components/OfflineBanner';
import { useStarterData } from '../data/starterData';
import { MORE_LINKS } from '../features/more/links';
import { SidebarAccount } from '../features/more/MorePage';
import { useShortcuts } from '../hooks/useShortcuts';
import { ThemeToggle } from '../components/ThemeToggle';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const MAIN: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/transactions', label: 'Transactions', icon: List },
];
const UPCOMING: NavItem = { to: '/upcoming', label: 'Upcoming', icon: CalendarClock };

const sideLink = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex items-center gap-3 rounded-md border-2 px-3 py-2 text-sm font-semibold',
    isActive ? 'border-edge bg-neon text-on-neon' : 'border-transparent text-slate-700 hover:bg-slate-100',
  );

const bottomLink = ({ isActive }: { isActive: boolean }) =>
  clsx('group flex flex-col items-center gap-1 py-2 text-[11px] font-semibold', isActive ? 'text-slate-900' : 'text-slate-500');

/** Icon in the phone tab bar: the active tab gets a neon pill behind it. */
function TabIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-7 w-12 items-center justify-center rounded-md border-2 border-transparent group-aria-[current=page]:border-edge group-aria-[current=page]:bg-neon group-aria-[current=page]:text-on-neon">
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

export function AppShell() {
  const starter = useStarterData();
  const navigation = useNavigation();
  useShortcuts();

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-md border-2 border-edge bg-neon px-4 py-2 text-on-neon focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      {navigation.state === 'loading' && (
        <div className="fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-neon" role="progressbar" aria-label="Loading page" />
      )}
      {/* Laptop: left sidebar */}
      <aside className="hidden w-64 shrink-0 border-r-2 border-[var(--edge-soft)] bg-white lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto p-4">
          <div className="flex items-center gap-3 px-1 pt-1 pb-2">
            <span className="brut-control flex size-10 items-center justify-center rounded-md bg-neon text-on-neon">
              <IndianRupee className="size-5" aria-hidden strokeWidth={2.5} />
            </span>
            <span className="font-display text-2xl leading-none font-semibold tracking-tight">Finance</span>
            <ThemeToggle className="ml-auto" />
          </div>
          <ButtonLink to="/add" title="Add transaction (N)">
            <Plus className="size-4" aria-hidden /> Add transaction
            <kbd className="ml-auto rounded-sm border border-current px-1.5 font-sans text-xs font-semibold">N</kbd>
          </ButtonLink>
          <nav aria-label="Main" className="space-y-1">
            {[...MAIN, UPCOMING, ...MORE_LINKS].map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={sideLink}>
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto">
            <SidebarAccount />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 outline-none lg:px-8 lg:pb-10 xl:max-w-7xl">
          <OfflineBanner />
          {starter.isError && (
            <div className="mb-6">
              <ErrorNotice
                title="Couldn't reach your data"
                action={
                  <Button variant="secondary" onClick={() => starter.refetch()}>
                    Try again
                  </Button>
                }
              >
                Check your internet connection. If this keeps happening, the database setup may be incomplete.
              </ErrorNotice>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* Phone: bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-[var(--edge-soft)] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 items-center">
          {MAIN.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} className={bottomLink}>
                <TabIcon icon={item.icon} />
                {item.label}
              </NavLink>
            </li>
          ))}
          <li className="flex justify-center">
            <NavLink
              to="/add"
              aria-label="Add transaction"
              className={({ isActive }) =>
                clsx(
                  'brut-control glow -mt-7 flex size-14 items-center justify-center rounded-md bg-neon text-on-neon',
                  isActive && 'translate-x-[3px] translate-y-[3px] shadow-none!',
                )
              }
            >
              <Plus className="size-7" aria-hidden strokeWidth={2.75} />
            </NavLink>
          </li>
          <li>
            <NavLink to={UPCOMING.to} className={bottomLink}>
              <TabIcon icon={UPCOMING.icon} />
              {UPCOMING.label}
            </NavLink>
          </li>
          <li>
            <NavLink to="/more" className={bottomLink}>
              <TabIcon icon={Ellipsis} />
              More
            </NavLink>
          </li>
        </ul>
      </nav>
    </div>
  );
}
