import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { AuthProvider } from './features/auth/AuthProvider';
import { NotConfiguredPage } from './features/auth/NotConfiguredPage';
import { queryClient } from './lib/queryClient';
import { supabaseConfig } from './lib/supabase';
import { applyTheme, watchSystemTheme } from './lib/theme';
import './index.css';

applyTheme();
watchSystemTheme();

// Cache the app itself for quick, installable starts (never financial data — see public/sw.js).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Not fatal: the app works without it.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfig.ok ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <NotConfiguredPage problem={supabaseConfig.problem} />
    )}
  </StrictMode>,
);
