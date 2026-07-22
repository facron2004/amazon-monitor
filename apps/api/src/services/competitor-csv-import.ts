import { parse } from "csv-parse/sync";

const REQUIRED_HEADERS = ["asin", "marketplace", "title"] as const;
export const MAX_COMPETITOR_CSV_ROWS = 1000;

export interface CompetitorCsvRow {
  row: number;
  values: Record<string, string>;
}

export function parseCompetitorCsv(source: string): CompetitorCsvRow[] {
  if (!source.trim()) {
    throw invalidCsv("CSV file is empty");
  }

  let headers: string[] = [];
  let records: Record<string, string>[];
  try {
    records = parse(source, {
      bom: true,
      columns: (input: string[]) => {
        headers = input.map((header) => header.trim().toLowerCase());
        return headers;
      },
      skip_empty_lines: true,
      trim: true
    }) as Record<string, string>[];
  } catch (error) {
    throw invalidCsv(error instanceof Error ? error.message : "CSV parsing failed");
  }

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw invalidCsv(`Missing required headers: ${missingHeaders.join(", ")}`);
  }
  if (new Set(headers).size !== headers.length) {
    throw invalidCsv("CSV contains duplicate headers");
  }
  if (records.length > MAX_COMPETITOR_CSV_ROWS) {
    throw invalidCsv(`CSV supports at most ${MAX_COMPETITOR_CSV_ROWS} data rows`);
  }

  return records.map((values, index) => ({ row: index + 2, values }));
}

function invalidCsv(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}
