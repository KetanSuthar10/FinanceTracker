import { LoaderCircle } from 'lucide-react';

export function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-slate-500" role="status">
      <LoaderCircle className="size-6 animate-spin text-teal-700" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}
