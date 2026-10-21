import { LoaderCircle } from 'lucide-react';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';

/** Standard loading / error handling for a screen's data. Renders nothing once data is ready. */
export function QueryState({ isLoading, error, retry }: { isLoading: boolean; error: unknown; retry?: () => void }) {
  if (error) {
    return (
      <ErrorNotice
        title="Couldn't load this"
        action={retry && (
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        )}
      >
        {error instanceof Error ? error.message : 'Please try again.'}
      </ErrorNotice>
    );
  }
  if (isLoading) {
    return (
      <div role="status" className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <LoaderCircle className="size-5 animate-spin text-teal-700" aria-hidden />
        Loading…
      </div>
    );
  }
  return null;
}
