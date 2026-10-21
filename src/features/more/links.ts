import { DatabaseBackup, FileUp, Gauge, Landmark, Settings, Tags, Users, type LucideIcon } from 'lucide-react';

export const MORE_LINKS: { to: string; label: string; icon: LucideIcon; hint: string }[] = [
  { to: '/accounts', label: 'Accounts', icon: Landmark, hint: 'Banks, cash and cards' },
  { to: '/import', label: 'Import statement', icon: FileUp, hint: 'CSV or Excel from your bank or card' },
  { to: '/budgets', label: 'Budgets', icon: Gauge, hint: 'Monthly limits per category' },
  { to: '/categories', label: 'Categories', icon: Tags, hint: 'Spending and income categories' },
  { to: '/recipients', label: 'Recipients', icon: Users, hint: 'Remembered names and categories' },
  { to: '/backup', label: 'Backup & export', icon: DatabaseBackup, hint: 'Download a backup or a CSV' },
  { to: '/settings', label: 'Settings', icon: Settings, hint: 'Default account, voice' },
];
