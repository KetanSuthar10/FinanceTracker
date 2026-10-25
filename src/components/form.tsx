import clsx from 'clsx';
import { useId, type ComponentProps, type ReactNode } from 'react';

const control =
  'well block w-full rounded-md text-slate-900 placeholder:text-slate-400 disabled:opacity-60';
/** Normal size for forms; compact for tables and filter bars on a computer. */
const size = (compact?: boolean) => (compact ? 'rounded-md px-2.5 py-1.5 text-sm' : 'px-3 py-2.5 text-base');
const controlBorder = (error?: string) => (error ? 'border-red-700!' : '');

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-800">
        {label}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ error, compact, className, ...props }: ComponentProps<'input'> & { error?: string; compact?: boolean }) {
  return <input aria-invalid={error ? true : undefined} className={clsx(control, size(compact), controlBorder(error), className)} {...props} />;
}

export function SelectInput({ error, compact, className, ...props }: ComponentProps<'select'> & { error?: string; compact?: boolean }) {
  return <select aria-invalid={error ? true : undefined} className={clsx(control, size(compact), controlBorder(error), className)} {...props} />;
}

export function TextArea({ error, className, ...props }: ComponentProps<'textarea'> & { error?: string }) {
  return <textarea aria-invalid={error ? true : undefined} className={clsx(control, size(), controlBorder(error), className)} {...props} />;
}

/** A row of mutually exclusive buttons (e.g. Expense / Income / Transfer / Refund). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="well grid auto-cols-fr grid-flow-col gap-1 rounded-md p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'min-h-10 rounded-[4px] px-1.5 font-display text-base font-medium transition-colors',
            value === o.value
              ? 'border-2 border-edge bg-neon text-on-neon shadow-[2px_2px_0_0_var(--color-edge)]'
              : 'border-2 border-transparent text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
