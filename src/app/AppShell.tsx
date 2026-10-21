import clsx from 'clsx';
import { CalendarClock, Ellipsis, House, IndianRupee, List, Plus, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigation } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { OfflineBanner } from '../components/OfflineBanner';
import { useStarterData } from '../data/starterData';
import { MORE_LINKS } from '../features/more/links';
import { SignOutCard } from '../features/more/MorePage';

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
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
    isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-100',
  );

const bottomLink = ({ isActive }: { isActive: boolean }) =>
  clsx('flex flex-col items-center gap-1 py-2 text-xs font-medium', isActive ? 'text-teal-700' : 'text-slate-500');

export function AppShell() {
  const starter = useStarterData();
  const navigation = useNavigation();

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-teal-700 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      {navigation.state === 'loading' && (
        <div className="fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-teal-600" role="progressbar" aria-label="Loading page" />
      )}
      {/* Laptop: left sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto p-4">
          <div className="flex items-center gap-2 px-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-teal-700 text-white">
              <IndianRupee className="size-4" aria-hidden />
            </span>
            <span className="font-semibold">Finance Tracker</span>
          </div>
          <ButtonLink to="/add">
            <Plus className="size-4" aria-hidden /> Add transaction
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
            <SignOutCard />
            <p className="mt-2 text-center text-xs text-slate-400">Version {__APP_VERSION__}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 outline-none lg:px-8 lg:pb-10">
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
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 items-center">
          {MAIN.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} className={bottomLink}>
                <item.icon className="size-6" aria-hidden />
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
                  'flex size-12 items-center justify-center rounded-full text-white shadow-md',
                  isActive ? 'bg-teal-800' : 'bg-teal-700',
                )
              }
            >
              <Plus className="size-6" aria-hidden />
            </NavLink>
          </li>
          <li>
            <NavLink to={UPCOMING.to} className={bottomLink}>
              <UPCOMING.icon className="size-6" aria-hidden />
              {UPCOMING.label}
            </NavLink>
          </li>
          <li>
            <NavLink to="/more" className={bottomLink}>
              <Ellipsis className="size-6" aria-hidden />
              More
            </NavLink>
          </li>
        </ul>
      </nav>
    </div>
  );
}
