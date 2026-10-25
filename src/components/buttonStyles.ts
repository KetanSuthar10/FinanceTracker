import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const styles: Record<ButtonVariant, string> = {
  // Neon fill with an ink edge; glows in dark mode.
  primary: 'brut-control glow bg-neon text-on-neon hover:brightness-105 disabled:opacity-50 disabled:shadow-none',
  secondary: 'brut-control bg-white text-slate-900 hover:bg-slate-100 disabled:text-slate-400 disabled:shadow-none',
  ghost: 'border-2 border-transparent text-slate-800 hover:bg-slate-100 disabled:text-slate-400',
  danger:
    'border-2 border-red-700 bg-white text-red-700 shadow-[3px_3px_0_0_var(--color-red-700)] hover:bg-red-50 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50',
};

export function buttonClass(variant: ButtonVariant = 'primary', className?: string) {
  return clsx(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-display text-base font-medium tracking-wide transition-colors disabled:cursor-not-allowed',
    styles[variant],
    className,
  );
}
