import { createBrowserRouter } from 'react-router';
import { AccountEditPage } from '../features/accounts/AccountEditPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { CategoriesPage } from '../features/categories/CategoriesPage';
import { HomePage } from '../features/home/HomePage';
import { MorePage } from '../features/more/MorePage';
import { RecipientEditPage } from '../features/recipients/RecipientEditPage';
import { RecipientsPage } from '../features/recipients/RecipientsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AddTransactionPage, EditTransactionPage } from '../features/transactions/TransactionPages';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { BudgetsPage } from '../features/budgets/BudgetsPage';
import { ImportPage } from '../features/import/ImportPage';
import { PayRecurringPage } from '../features/upcoming/PayRecurringPage';
import { RecurringEditPage } from '../features/upcoming/RecurringEditPage';
import { UpcomingPage } from '../features/upcoming/UpcomingPage';
import { AuthGate } from './AuthGate';
import { NotFoundPage } from './NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AuthGate />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'transactions/:id', element: <EditTransactionPage /> },
      { path: 'add', element: <AddTransactionPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'accounts/new', element: <AccountEditPage /> },
      { path: 'accounts/:id', element: <AccountEditPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'recipients', element: <RecipientsPage /> },
      { path: 'recipients/:id', element: <RecipientEditPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'upcoming', element: <UpcomingPage /> },
      { path: 'recurring/new', element: <RecurringEditPage /> },
      { path: 'recurring/:id', element: <RecurringEditPage /> },
      { path: 'recurring/:id/pay', element: <PayRecurringPage /> },
      { path: 'budgets', element: <BudgetsPage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
