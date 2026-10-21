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
    'flex size-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} onClick={onPrevious} aria-label="Previous month">
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <span className="min-w-36 text-center font-semibold" aria-live="polite">
        {label}
      </span>
      <button type="button" className={btn} onClick={onNext} disabled={!canGoNext} aria-label="Next month">
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
