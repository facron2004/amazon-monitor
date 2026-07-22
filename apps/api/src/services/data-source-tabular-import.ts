import type { DataSourceImportPayload } from "@amazon-monitor/shared";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";

export interface DataSourceImportRow {
  row: number;
  values: Record<string, string>;
}

const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024;

export async function parseDataSourceImportRows(
  input: DataSourceImportPayload,
  requiredHeaders: readonly string[],
  maxRows = 1000
): Promise<DataSourceImportRow[]> {
  return input.format === "csv"
    ? parseCsvRows(input.content, requiredHeaders, maxRows)
    : parseExcelRows(input.contentBase64, requiredHeaders, maxRows);
}

function parseCsvRows(
  csv: string,
  requiredHeaders: readonly string[],
  maxRows: number
): DataSourceImportRow[] {
  if (!csv.trim()) throw invalidInput("CSV file is empty");
  let headers: string[] = [];
  let records: Record<string, string>[];
  try {
    records = parse(csv, {
      bom: true,
      columns: (input: string[]) => {
        headers = input.map((header) => header.trim());
        return headers;
      },
      skip_empty_lines: true,
      trim: true
    }) as Record<string, string>[];
  } catch (error) {
    throw invalidInput(error instanceof Error ? error.message : "CSV parsing failed");
  }
  validateHeaders(headers, requiredHeaders, "CSV");
  validateRowCount(records.length, maxRows, "CSV");
  return records.map((values, index) => ({ row: index + 2, values }));
}

async function parseExcelRows(
  contentBase64: string,
  requiredHeaders: readonly string[],
  maxRows: number
): Promise<DataSourceImportRow[]> {
  const buffer = decodeWorkbook(contentBase64);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  } catch (error) {
    throw invalidInput(error instanceof Error ? `Excel parsing failed: ${error.message}` : "Excel parsing failed");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw invalidInput("Excel workbook contains no worksheets");

  const headers = readRow(sheet.getRow(1));
  validateHeaders(headers, requiredHeaders, "Excel");
  const rows: DataSourceImportRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (worksheetRow, rowNumber) => {
    if (rowNumber === 1) return;
    const values = Object.fromEntries(headers.map((header, index) => [
      header,
      cellText(worksheetRow.getCell(index + 1).value)
    ]));
    if (Object.values(values).every((value) => value === "")) return;
    rows.push({ row: rowNumber, values });
  });
  validateRowCount(rows.length, maxRows, "Excel");
  return rows;
}

function decodeWorkbook(contentBase64: string): Buffer {
  const normalized = contentBase64.trim();
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw invalidInput("Excel content must be valid base64");
  }
  const buffer = Buffer.from(normalized, "base64");
  if (buffer.length === 0) throw invalidInput("Excel file is empty");
  if (buffer.length > MAX_WORKBOOK_BYTES) {
    throw invalidInput(`Excel file must not exceed ${MAX_WORKBOOK_BYTES / 1024 / 1024} MB`);
  }
  return buffer;
}

function readRow(row: ExcelJS.Row): string[] {
  const headers: string[] = [];
  for (let index = 1; index <= row.cellCount; index += 1) {
    headers.push(cellText(row.getCell(index).value));
  }
  return headers;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result ?? null);
    if ("text" in value) return value.text.trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("error" in value) return value.error;
  }
  return String(value).trim();
}

function validateHeaders(headers: string[], requiredHeaders: readonly string[], label: string): void {
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw invalidInput(`Missing required headers: ${missing.join(", ")}`);
  if (headers.some((header) => !header)) throw invalidInput(`${label} contains empty headers`);
  if (new Set(headers).size !== headers.length) throw invalidInput(`${label} contains duplicate headers`);
}

function validateRowCount(count: number, maxRows: number, label: string): void {
  if (count === 0) throw invalidInput(`${label} contains no data rows`);
  if (count > maxRows) throw invalidInput(`${label} supports at most ${maxRows} data rows`);
}

function invalidInput(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}
