import { useSyncExternalStore } from 'react';

/** Matches Tailwind's `lg` breakpoint (1024px), where the sidebar layout starts. */
const QUERY = '(min-width: 1024px)';

function subscribe(callback: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

/**
 * True on laptop/desktop widths. Used where the computer layout is a different component
 * (e.g. a table instead of cards), so only one version is in the page at a time.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
