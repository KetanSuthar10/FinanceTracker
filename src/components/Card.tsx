import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('brut min-w-0 rounded-md bg-white p-4 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg leading-tight font-medium text-slate-900">{title}</h2>}
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
        <h1 className="text-4xl leading-none font-semibold tracking-tight sm:text-5xl">{title}</h1>
      </div>
      {action}
    </header>
  );
}
