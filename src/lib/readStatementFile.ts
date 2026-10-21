/**
 * Reads a statement file in the browser into a grid of strings. Nothing is uploaded.
 * CSV (any delimiter Papa Parse can detect) and .xlsx. Old .xls and PDF are refused with a clear next step.
 */
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';
import type { Grid } from '../domain/importer';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class StatementFileError extends Error {}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Spreadsheet dates come back as UTC midnight.
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  return String(value);
}

export async function readStatementFile(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) throw new StatementFileError('This file is larger than 5 MB. Download a shorter date range.');
  if (name.endsWith('.pdf')) {
    throw new StatementFileError('PDF statements can’t be read. Download the statement as CSV or Excel (.xlsx) from your bank instead.');
  }
  if (name.endsWith('.xls')) {
    throw new StatementFileError(
      'Old Excel (.xls) files can’t be read yet. Open it in Excel or Google Sheets and save it as .xlsx or CSV, or download CSV from your bank.',
    );
  }

  if (name.endsWith('.xlsx')) {
    try {
      const rows = await readSheet(file, { parseNumber: (s: string) => s });
      return rows.map((r) => r.map(cellToString));
    } catch {
      throw new StatementFileError('This Excel file couldn’t be read. Try saving it again as .xlsx or CSV.');
    }
  }

  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    const text = await file.text();
    const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false });
    if (result.data.length === 0) throw new StatementFileError('This file is empty.');
    return result.data.map((r) => r.map(cellToString));
  }

  throw new StatementFileError('Choose a CSV or Excel (.xlsx) file.');
}
