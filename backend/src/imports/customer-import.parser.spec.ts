import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import {
  parseTabularFile,
  suggestCustomerMapping,
} from './customer-import.parser';

/** Build a real .xlsx buffer from a grid of cells for the XLSX parse tests. */
async function xlsxBuffer(rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseTabularFile', () => {
  describe('CSV', () => {
    it('parses headers and rows, trimming cells and normalising width', async () => {
      const csv =
        'Name,Phone,Email\nAda,08011112222,ada@example.com\nBola, 08033334444 ,\n';
      const result = await parseTabularFile('customers.csv', Buffer.from(csv));

      expect(result.columns).toEqual(['Name', 'Phone', 'Email']);
      expect(result.rows).toEqual([
        ['Ada', '08011112222', 'ada@example.com'],
        ['Bola', '08033334444', ''],
      ]);
    });

    it('strips a UTF-8 BOM from the first header', async () => {
      const result = await parseTabularFile(
        'c.csv',
        Buffer.from('﻿Name,Phone\nAda,0801\n', 'utf8'),
      );
      expect(result.columns).toEqual(['Name', 'Phone']);
    });

    it('drops fully-blank rows rather than importing empty customers', async () => {
      const result = await parseTabularFile(
        'c.csv',
        Buffer.from('Name,Phone\nAda,0801\n,,\nBola,0802\n'),
      );
      expect(result.rows).toEqual([
        ['Ada', '0801'],
        ['Bola', '0802'],
      ]);
    });

    it('rejects an empty file', async () => {
      await expect(
        parseTabularFile('c.csv', Buffer.from('')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a header-only file', async () => {
      await expect(
        parseTabularFile('c.csv', Buffer.from('Name,Phone\n')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('XLSX', () => {
    it('parses the first worksheet, coercing a numeric cell to plain digits', async () => {
      const buffer = await xlsxBuffer([
        ['Name', 'Phone', 'Email'],
        ['Ada', 8011112222, 'ada@example.com'],
      ]);
      const result = await parseTabularFile('customers.xlsx', buffer);

      expect(result.columns).toEqual(['Name', 'Phone', 'Email']);
      // The phone was a number cell → plain digits, never "8,011,112,222".
      expect(result.rows).toEqual([['Ada', '8011112222', 'ada@example.com']]);
    });

    it('rejects a header-only workbook', async () => {
      const buffer = await xlsxBuffer([['Name', 'Phone']]);
      await expect(
        parseTabularFile('c.xlsx', buffer),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('rejects an unsupported file extension', async () => {
    await expect(
      parseTabularFile('customers.txt', Buffer.from('Name\nAda\n')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('suggestCustomerMapping', () => {
  it('maps common header names case-insensitively', () => {
    expect(
      suggestCustomerMapping(['Full Name', 'Phone Number', 'Email Address', 'Notes']),
    ).toEqual({ name: 0, phone: 1, email: 2, notes: 3 });
  });

  it('recognises alternative header words', () => {
    expect(
      suggestCustomerMapping(['Customer', 'WhatsApp', 'e-mail', 'Comment']),
    ).toEqual({ name: 0, phone: 1, email: 2, notes: 3 });
  });

  it('leaves unmatched fields null', () => {
    expect(suggestCustomerMapping(['Client', 'Address'])).toEqual({
      name: null,
      phone: null,
      email: null,
      notes: null,
    });
  });

  it('never assigns the same column to two fields', () => {
    // Column 0 matches both name and email; the earlier field (name) claims it,
    // so email must look elsewhere and, finding nothing, stays null.
    expect(suggestCustomerMapping(['Name and Email', 'Phone'])).toEqual({
      name: 0,
      phone: 1,
      email: null,
      notes: null,
    });
  });
});
