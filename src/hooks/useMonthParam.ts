import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { addMonths, formatMonthLabel, isValidMonthKey, monthKey, monthRange, todayIST } from '../lib/dates';

/** The selected month lives in the URL (?month=2026-10) so back/forward and links keep it. */
export function useMonthParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('month') ?? '';
  const current = monthKey(todayIST());
  const month = isValidMonthKey(raw) ? raw : current;
  const { from, through } = monthRange(`${month}-01`);

  const setMonth = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === current) p.delete('month');
          else p.set('month', next);
          return p;
        },
        { replace: true },
      );
    },
    [setParams, current],
  );

  return {
    month,
    from,
    through,
    label: formatMonthLabel(from),
    isCurrent: month === current,
    previous: () => setMonth(monthKey(addMonths(from, -1))),
    next: () => setMonth(monthKey(addMonths(from, 1))),
    setMonth,
  };
}
