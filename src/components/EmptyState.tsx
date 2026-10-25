import type { ReactNode } from 'react';

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-md border-2 border-dashed border-slate-400 bg-white px-6 py-10 text-center">
      <div className="brut-control mb-4 flex size-14 items-center justify-center rounded-md bg-neon text-on-neon">{icon}</div>
      <h2 className="text-2xl leading-tight font-semibold text-slate-900">{title}</h2>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-600">{children}</div>}
    </div>
  );
}
