import type { ReactNode } from 'react';

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">{icon}</div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-600">{children}</div>}
    </div>
  );
}
