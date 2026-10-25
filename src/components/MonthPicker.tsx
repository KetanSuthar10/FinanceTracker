import { ChevronLeft, ChevronRight } from 'lucide-react';

export function MonthPicker({
  label,
  onPrevious,
  onNext,
  canGoNext,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  const btn =
    'raised flex size-10 items-center justify-center rounded-md text-slate-800 disabled:text-slate-300 disabled:shadow-none';
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} onClick={onPrevious} aria-label="Previous month">
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <span className="min-w-36 text-center font-display text-lg font-medium" aria-live="polite">
        {label}
      </span>
      <button type="button" className={btn} onClick={onNext} disabled={!canGoNext} aria-label="Next month">
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
