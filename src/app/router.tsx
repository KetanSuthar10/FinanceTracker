import { createBrowserRouter } from 'react-router';
import { HomePage } from '../features/home/HomePage';
import { MorePage } from '../features/more/MorePage';
import { AuthGate } from './AuthGate';
import { NotFoundPage } from './NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AuthGate />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
