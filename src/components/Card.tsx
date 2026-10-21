import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('min-w-0 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-slate-600">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      {action}
    </header>
  );
}
