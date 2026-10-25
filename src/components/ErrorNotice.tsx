import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

export function ErrorNotice({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex gap-3 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm text-red-900 shadow-[4px_4px_0_0_var(--color-red-700)]">
      <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-red-800">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
