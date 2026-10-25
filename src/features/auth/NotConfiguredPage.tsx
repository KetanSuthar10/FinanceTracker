import { Settings2 } from 'lucide-react';

export function NotConfiguredPage({ problem }: { problem: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md brut rounded-md bg-white p-6">
        <div className="mb-4 flex size-12 items-center justify-center rounded-md border-2 border-amber-700 bg-amber-50 text-amber-700">
          <Settings2 className="size-6" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">The app isn't connected yet</h1>
        <p className="mt-2 text-sm text-slate-600">{problem}</p>
        <p className="mt-4 text-sm text-slate-600">
          Add your Supabase project URL and publishable key as environment variables (in{' '}
          <code className="rounded bg-slate-100 px-1">.env.local</code> locally, or in your host's settings — Netlify or
          Vercel), then build and deploy again. The steps are in <code className="rounded bg-slate-100 px-1">docs/SETUP.md</code>.
        </p>
      </div>
    </main>
  );
}
