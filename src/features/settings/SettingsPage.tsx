import { Card, PageHeader } from '../../components/Card';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useEffect, useState } from 'react';
import { Field, Segmented, SelectInput } from '../../components/form';
import { getThemePreference, setThemePreference, type ThemePreference } from '../../lib/theme';
import { QueryState } from '../../components/LoadingBlock';
import { useSetDefaultAccount } from '../../data/settings';
import { useLookups } from '../../hooks/useLookups';

function AppearanceCard() {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);
  // Stay in step with the quick light/dark switch in the sidebar.
  useEffect(() => {
    const sync = () => setPref(getThemePreference());
    window.addEventListener('themechange', sync);
    return () => window.removeEventListener('themechange', sync);
  }, []);
  return (
    <Card title="Appearance">
      <Segmented
        label="Appearance"
        value={pref}
        options={[
          { value: 'system', label: 'Same as device' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={(value) => {
          setPref(value);
          setThemePreference(value);
        }}
      />
      <p className="mt-2 text-sm text-slate-500">Saved on this device only.</p>
    </Card>
  );
}

export function SettingsPage() {
  const lookups = useLookups();
  const setDefault = useSetDefaultAccount();

  return (
    <div className="mx-auto max-w-2xl space-y-5 lg:max-w-5xl">
      <PageHeader title="Settings" />
      <QueryState isLoading={lookups.isLoading} error={lookups.error} retry={lookups.refetch} />
      {!lookups.isLoading && !lookups.error && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card title="Quick add">
            <Field label="Default account" hint='Used when you don’t name an account, e.g. "120 cafe upi". UPI, GPay and PhonePe are payment methods, not accounts.'>
              {(id, d) => (
                <SelectInput
                  id={id}
                  aria-describedby={d}
                  value={lookups.defaultAccountId ?? ''}
                  onChange={(e) => setDefault.mutate(e.target.value || null)}
                  disabled={setDefault.isPending}
                >
                  <option value="">None — always ask</option>
                  {lookups.accounts
                    .filter((a) => !a.archived)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </SelectInput>
              )}
            </Field>
            {setDefault.error && (
              <div className="mt-3">
                <ErrorNotice title="Not saved">{setDefault.error.message}</ErrorNotice>
              </div>
            )}
          </Card>

          <AppearanceCard />

          <Card title="Voice input">
            <p className="text-sm text-slate-600">
              The mic button uses your browser’s speech recognition. In Chrome, what you say is turned into text by Google’s
              speech service. Only that sentence is sent — never your balances or transactions. You can always check and edit
              the text before saving, or use your phone keyboard’s own mic instead.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
