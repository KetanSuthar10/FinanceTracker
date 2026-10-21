import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Saving and loading need a connection; say so plainly instead of failing silently. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You’re offline — connect to the internet to save or load your data.
    </div>
  );
}
