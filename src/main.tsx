import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { AuthProvider } from './features/auth/AuthProvider';
import { NotConfiguredPage } from './features/auth/NotConfiguredPage';
import { queryClient } from './lib/queryClient';
import { supabaseConfig } from './lib/supabase';
import './index.css';

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
