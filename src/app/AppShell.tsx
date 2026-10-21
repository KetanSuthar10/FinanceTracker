import clsx from 'clsx';
import { Ellipsis, House, IndianRupee, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { useStarterData } from '../data/starterData';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Screens are added here as each roadmap phase delivers them.
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/more', label: 'More', icon: Ellipsis },
];

export function AppShell() {
  const starter = useStarterData();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Laptop: left sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 flex h-dvh flex-col p-4">
          <div className="mb-6 flex items-center gap-2 px-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-teal-700 text-white">
              <IndianRupee className="size-4" aria-hidden />
            </span>
            <span className="font-semibold">Finance Tracker</span>
          </div>
          <nav aria-label="Main" className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-100',
                  )
                }
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-10">
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
        <ul className="mx-auto flex max-w-md justify-around">
          {NAV_ITEMS.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center gap-1 py-2.5 text-xs font-medium',
                    isActive ? 'text-teal-700' : 'text-slate-500',
                  )
                }
              >
                <item.icon className="size-6" aria-hidden />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
