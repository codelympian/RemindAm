import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Workbook, type CellValue } from 'exceljs';
import type { CustomerColumnMapping, ImportableCustomerField } from '@remindam/shared';

/**
 * A parsed spreadsheet: the header row as `columns`, and every data row (header
 * excluded) as an array of trimmed string cells normalised to `columns.length`.
 * Both CSV and XLSX collapse to this one shape so the rest of the import
 * pipeline never has to care which format was uploaded.
 */
export interface ParsedTable {
  columns: string[];
  rows: string[][];
}

/**
 * Case-insensitive header keywords that hint at each customer field. Used only
 * to *suggest* a mapping the user then reviews — never to decide it silently.
 */
const HEADER_HINTS: Record<ImportableCustomerField, string[]> = {
  name: ['name', 'customer'],
  phone: ['phone', 'mobile', 'tel', 'whatsapp', 'number'],
  email: ['email', 'e-mail', 'mail'],
  notes: ['note', 'comment', 'remark'],
};

const FIELD_ORDER: ImportableCustomerField[] = ['name', 'phone', 'email', 'notes'];

/** The lowercased file extension, or '' when the filename carries none. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/**
 * Coerce one exceljs cell value to a plain trimmed string. Numbers, booleans and
 * dates become their text; rich text, hyperlinks and formula results are reduced
 * to the underlying text so a phone typed as a number or a hyperlinked email
 * still imports as the value the user sees.
 */
function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value) {
    return value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  }
  if ('hyperlink' in value) return value.text.trim();
  if ('error' in value) return value.error;
  // Regular or shared formula: use the cached result exceljs loaded from the file.
  return cellToString(value.result ?? '');
}

/**
 * Turn a raw grid (header row first, every row already string-coerced) into a
 * {@link ParsedTable}: trim trailing empty header columns, normalise each data
 * row to that width, and drop fully-blank rows. Throws a 400 when there is no
 * header or no data — the user must never think an empty import "worked" (§24).
 */
function finalise(grid: string[][]): ParsedTable {
  if (grid.length === 0) {
    throw new BadRequestException('The file appears to be empty.');
  }

  const header = grid[0];
  let width = header.length;
  while (width > 0 && header[width - 1].trim() === '') width--;
  if (width === 0) {
    throw new BadRequestException('The first row must contain column headers.');
  }

  const columns = header.slice(0, width).map((cell) => cell.trim());
  const rows = grid
    .slice(1)
    .map((row) => {
      const cells: string[] = [];
      for (let i = 0; i < width; i++) cells.push((row[i] ?? '').trim());
      return cells;
    })
    .filter((row) => row.some((cell) => cell !== ''));

  if (rows.length === 0) {
    throw new BadRequestException('The file has no data rows to import.');
  }

  return { columns, rows };
}

/** Parse a CSV buffer into a raw grid of string cells (header row included). */
function parseCsv(buffer: Buffer): string[][] {
  try {
    return parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch {
    throw new BadRequestException(
      'Could not read the CSV file. Please check that it is a valid CSV.',
    );
  }
}

/** Parse the first worksheet of an XLSX buffer into a raw grid of string cells. */
async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new Workbook();
  try {
    // exceljs types load() for a Node Buffer via its Excel address space.
    await workbook.xlsx.load(buffer);
  } catch {
    throw new BadRequestException(
      'Could not read the Excel file. Please check that it is a valid .xlsx file.',
    );
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new BadRequestException('The spreadsheet has no worksheets.');
  }

  const grid: string[][] = [];
  const width = worksheet.columnCount;
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let column = 1; column <= width; column++) {
      cells.push(cellToString(row.getCell(column).value));
    }
    grid.push(cells);
  });

  return grid;
}

/**
 * Parse an uploaded CSV or XLSX file into a {@link ParsedTable}. The extension
 * decides the parser; an unsupported one is a 400 (the controller's file filter
 * already blocks these, so this is defence in depth). All import parsing happens
 * here on the server — the frontend only ever uploads the raw bytes (§5/§46).
 */
export async function parseTabularFile(
  filename: string,
  buffer: Buffer,
): Promise<ParsedTable> {
  const ext = extensionOf(filename);
  if (ext === 'csv') return finalise(parseCsv(buffer));
  if (ext === 'xlsx') return finalise(await parseXlsx(buffer));
  throw new BadRequestException(
    'Unsupported file type. Upload a .csv or .xlsx file.',
  );
}

/**
 * Suggest a column mapping from the header names: the first as-yet-unused column
 * whose header contains a hint keyword is assigned to each field, in
 * name → phone → email → notes order. Any field with no match stays `null` for
 * the user to set (or leave unimported) on the mapping step.
 */
export function suggestCustomerMapping(columns: string[]): CustomerColumnMapping {
  const mapping: CustomerColumnMapping = {
    name: null,
    phone: null,
    email: null,
    notes: null,
  };
  const used = new Set<number>();
  const lower = columns.map((column) => column.toLowerCase());

  for (const field of FIELD_ORDER) {
    for (let i = 0; i < lower.length; i++) {
      if (used.has(i)) continue;
      if (HEADER_HINTS[field].some((hint) => lower[i].includes(hint))) {
        mapping[field] = i;
        used.add(i);
        break;
      }
    }
  }

  return mapping;
}
