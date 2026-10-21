import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Field, Segmented, SelectInput } from '../../components/form';
import { normalizeRows, suggestMapping, type AmountStyle, type ColumnMapping, type Grid } from '../../domain/importer';
import { formatShortDate } from '../../lib/dates';
import { formatINR } from '../../lib/money';

interface Props {
  grid: Grid;
  initialHeaderRow: number;
  initialMapping: Partial<ColumnMapping>;
  accountIsCard: boolean;
  onBack: () => void;
  onConfirm: (headerRow: number, mapping: ColumnMapping) => void;
}

const STYLE_OPTIONS: { value: AmountStyle; label: string }[] = [
  { value: 'debit_credit', label: 'Debit + credit columns' },
  { value: 'signed', label: 'One amount column' },
  { value: 'amount_drcr', label: 'Amount + Dr/Cr column' },
];

/** Asks which columns hold the date, description and amounts. Remembered per account. */
export function MappingStep({ grid, initialHeaderRow, initialMapping, accountIsCard, onBack, onConfirm }: Props) {
  const [headerRow, setHeaderRow] = useState(Math.max(0, initialHeaderRow));
  const [m, setM] = useState<Partial<ColumnMapping>>({
    positiveMeans: accountIsCard ? 'out' : 'in',
    ...initialMapping,
  });
  const headers = (grid[headerRow] ?? []).map((h) => h.trim()).filter(Boolean);
  const set = (patch: Partial<ColumnMapping>) => setM((prev) => ({ ...prev, ...patch }));

  function changeHeaderRow(row: number) {
    setHeaderRow(row);
    setM({ positiveMeans: m.positiveMeans, ...suggestMapping(grid, row) });
  }

  const missing: string[] = [];
  if (!m.date) missing.push('date');
  if (!m.description) missing.push('description');
  if (!m.amountStyle) missing.push('amount style');
  if (m.amountStyle === 'debit_credit' && (!m.debit || !m.credit)) missing.push('debit and credit columns');
  if (m.amountStyle !== 'debit_credit' && !m.amount) missing.push('amount column');
  if (m.amountStyle === 'amount_drcr' && !m.drcr) missing.push('Dr/Cr column');
  const complete = missing.length === 0;

  const preview = useMemo(() => {
    if (!complete) return null;
    const mapping = { dateFormat: 'dmy', ...m } as ColumnMapping;
    const sample = grid.slice(0, headerRow + 9);
    return normalizeRows(sample, headerRow, mapping);
  }, [complete, m, grid, headerRow]);

  const column = (label: string, key: keyof ColumnMapping, optional = false) => (
    <Field label={label}>
      {(id) => (
        <SelectInput id={id} value={(m[key] as string) ?? ''} onChange={(e) => set({ [key]: e.target.value || undefined })}>
          <option value="">{optional ? 'None' : 'Choose…'}</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </SelectInput>
      )}
    </Field>
  );

  return (
    <div className="space-y-4">
      <Card title="Which columns are which?">
        <p className="mb-4 text-sm text-slate-600">
          Checked once per account and remembered for next time. The best guess is already filled in.
        </p>
        <div className="space-y-4">
          <Field label="Line with the column names">
            {(id) => (
              <SelectInput id={id} value={headerRow} onChange={(e) => changeHeaderRow(Number(e.target.value))}>
                {grid.slice(0, 40).map((row, i) => {
                  const text = row.map((c) => c.trim()).filter(Boolean).join(' | ');
                  return text ? (
                    <option key={i} value={i}>
                      Line {i + 1}: {text.slice(0, 80)}
                    </option>
                  ) : null;
                })}
              </SelectInput>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {column('Date', 'date')}
            {column('Description / narration', 'description')}
          </div>
          <Segmented label="How amounts are shown" value={m.amountStyle ?? 'debit_credit'} options={STYLE_OPTIONS} onChange={(v) => set({ amountStyle: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            {(m.amountStyle ?? 'debit_credit') === 'debit_credit' ? (
              <>
                {column('Money out (debit / withdrawal)', 'debit')}
                {column('Money in (credit / deposit)', 'credit')}
              </>
            ) : (
              <>
                {column('Amount', 'amount')}
                {m.amountStyle === 'amount_drcr' ? (
                  column('Dr / Cr column', 'drcr')
                ) : (
                  <Field label="A positive amount means">
                    {(id) => (
                      <SelectInput id={id} value={m.positiveMeans ?? 'in'} onChange={(e) => set({ positiveMeans: e.target.value as 'in' | 'out' })}>
                        <option value="in">Money in (bank statements usually)</option>
                        <option value="out">Money out / a charge (card statements usually)</option>
                      </SelectInput>
                    )}
                  </Field>
                )}
              </>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date order">
              {(id) => (
                <SelectInput id={id} value={m.dateFormat ?? 'dmy'} onChange={(e) => set({ dateFormat: e.target.value as ColumnMapping['dateFormat'] })}>
                  <option value="dmy">Day / Month / Year (31/10/2026)</option>
                  <option value="mdy">Month / Day / Year (10/31/2026)</option>
                  <option value="ymd">Year-Month-Day (2026-10-31)</option>
                </SelectInput>
              )}
            </Field>
            {column('Reference number (optional)', 'reference', true)}
          </div>
        </div>
      </Card>

      <Card title="Preview">
        {!complete ? (
          <p className="text-sm text-amber-800">Still needed: {missing.join(', ')}.</p>
        ) : preview && preview.rows.length + preview.errors.length === 0 ? (
          <p className="text-sm text-amber-800">No transactions found below that line. Check the line with the column names.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {preview?.rows.slice(0, 6).map((r) => (
              <li key={r.line} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-slate-500">{formatShortDate(r.date)}</span>
                <span className="min-w-0 flex-1 truncate">{r.description}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${r.direction === 'in' ? 'text-emerald-700' : ''}`}>
                  {r.direction === 'in' ? '+' : '−'}
                  {formatINR(r.amountPaise)}
                </span>
              </li>
            ))}
            {preview?.errors.slice(0, 3).map((e) => (
              <li key={`e${e.line}`} className="py-2 text-red-700">
                Line {e.line}: {e.reason}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">Check that money out shows “−” and money in shows “+”.</p>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!complete} onClick={() => onConfirm(headerRow, { dateFormat: 'dmy', ...m } as ColumnMapping)}>
          Continue to review
        </Button>
      </div>
    </div>
  );
}
