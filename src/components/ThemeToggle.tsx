import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { setThemePreference } from '../lib/theme';

function subscribe(callback: () => void) {
  window.addEventListener('themechange', callback);
  return () => window.removeEventListener('themechange', callback);
}
const isDark = () => document.documentElement.dataset.theme === 'dark';

/** One-tap light/dark switch. The full choice (including "same as device") is in Settings. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return (
    <button
      type="button"
      onClick={() => setThemePreference(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Use light mode' : 'Use dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={clsx('raised flex size-10 shrink-0 items-center justify-center rounded-md text-slate-800', className)}
    >
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}
