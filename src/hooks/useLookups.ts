import { useMemo } from 'react';
import { useAccounts } from '../data/accounts';
import { useCategories } from '../data/categories';
import { useRecipients } from '../data/recipients';
import { useSettings } from '../data/settings';

/** Accounts, categories, recipients and settings together, with id → record maps. */
export function useLookups() {
  const accounts = useAccounts();
  const categories = useCategories();
  const recipients = useRecipients();
  const settings = useSettings();

  return useMemo(
    () => ({
      accounts: accounts.data ?? [],
      categories: categories.data ?? [],
      recipients: recipients.data ?? [],
      defaultAccountId: settings.data?.default_account_id ?? null,
      accountById: new Map((accounts.data ?? []).map((a) => [a.id, a])),
      categoryById: new Map((categories.data ?? []).map((c) => [c.id, c])),
      recipientById: new Map((recipients.data ?? []).map((r) => [r.id, r])),
      isLoading: accounts.isLoading || categories.isLoading || recipients.isLoading || settings.isLoading,
      error: accounts.error ?? categories.error ?? recipients.error ?? settings.error,
      refetch: () => {
        void accounts.refetch();
        void categories.refetch();
        void recipients.refetch();
        void settings.refetch();
      },
    }),
    [accounts, categories, recipients, settings],
  );
}
