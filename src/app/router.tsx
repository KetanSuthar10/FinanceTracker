import { createBrowserRouter } from 'react-router';
import { HomePage } from '../features/home/HomePage';
import { MorePage } from '../features/more/MorePage';
import { AddTransactionPage, EditTransactionPage } from '../features/transactions/TransactionPages';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { AuthGate } from './AuthGate';
import { NotFoundPage } from './NotFoundPage';

// Everyday screens load with the app; the rest load the first time they're opened.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AuthGate />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'transactions/:id', element: <EditTransactionPage /> },
      { path: 'add', element: <AddTransactionPage /> },
      { path: 'more', element: <MorePage /> },
      { path: 'accounts', lazy: () => import('../features/accounts/AccountsPage').then((m) => ({ Component: m.AccountsPage })) },
      { path: 'accounts/new', lazy: () => import('../features/accounts/AccountEditPage').then((m) => ({ Component: m.AccountEditPage })) },
      { path: 'accounts/:id', lazy: () => import('../features/accounts/AccountEditPage').then((m) => ({ Component: m.AccountEditPage })) },
      { path: 'categories', lazy: () => import('../features/categories/CategoriesPage').then((m) => ({ Component: m.CategoriesPage })) },
      { path: 'recipients', lazy: () => import('../features/recipients/RecipientsPage').then((m) => ({ Component: m.RecipientsPage })) },
      { path: 'recipients/:id', lazy: () => import('../features/recipients/RecipientEditPage').then((m) => ({ Component: m.RecipientEditPage })) },
      { path: 'settings', lazy: () => import('../features/settings/SettingsPage').then((m) => ({ Component: m.SettingsPage })) },
      { path: 'upcoming', lazy: () => import('../features/upcoming/UpcomingPage').then((m) => ({ Component: m.UpcomingPage })) },
      { path: 'recurring/new', lazy: () => import('../features/upcoming/RecurringEditPage').then((m) => ({ Component: m.RecurringEditPage })) },
      { path: 'recurring/:id', lazy: () => import('../features/upcoming/RecurringEditPage').then((m) => ({ Component: m.RecurringEditPage })) },
      { path: 'recurring/:id/pay', lazy: () => import('../features/upcoming/PayRecurringPage').then((m) => ({ Component: m.PayRecurringPage })) },
      { path: 'budgets', lazy: () => import('../features/budgets/BudgetsPage').then((m) => ({ Component: m.BudgetsPage })) },
      { path: 'import', lazy: () => import('../features/import/ImportPage').then((m) => ({ Component: m.ImportPage })) },
      { path: 'backup', lazy: () => import('../features/export/ExportPage').then((m) => ({ Component: m.ExportPage })) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
